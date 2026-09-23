const express = require('express');
const router = express.Router();
const Membership = require('../models/Membership');
const MembershipPlan = require('../models/MembershipPlan');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const { auth, authorize } = require('../middleware/auth');
const { parsePagination } = require('../utils/helpers');
const { allocateTrainerForMembership } = require('../utils/trainerAllocation');
const { serializeMembership } = require('../utils/membershipView');
const { canTrainerAccessMember } = require('../utils/access');
const { logAudit } = require('../utils/audit');

// Entitlement follow-up for flows that grant ACTIVE membership without a
// payment (complimentary grants and counter renewals). Never blocks the main
// action - a failed allocation only logs.
const applyEntitlement = async (membershipId) => {
  try {
    await allocateTrainerForMembership(membershipId);
  } catch (error) {
    console.error('trainer allocation failed (complimentary/renew)', error);
  }
};

router.get('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query.page, req.query.limit, 1, 20, 100);
    const { status, userId } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (userId) filter.user = userId;

    const total = await Membership.countDocuments(filter);
    const memberships = await Membership.find(filter)
      .select('user plan startDate endDate status autoRenew')
      .populate('user', 'name email')
      .populate('plan', 'name price duration')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({ memberships, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/my', auth, async (req, res) => {
  try {
    const memberships = await Membership.find({ user: req.user._id })
      .populate('plan')
      .sort({ createdAt: -1 })
      .lean();

    // Enrich each membership with derived facts (expiry, progress, payment
    // summary, trainer block) so the member never has to piece together their
    // own membership from multiple sources.
    const enriched = [];
    for (const membership of memberships) {
      enriched.push(await serializeMembership(membership, { withPayments: true }));
    }
    res.json({ memberships: enriched });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/active/:userId', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    // Trainers may only inspect members they are entitled to coach.
    if (req.user.role === 'trainer') {
      const allowed = await canTrainerAccessMember(req.user._id, req.params.userId);
      if (!allowed) return res.status(403).json({ message: 'Access denied' });
    }
    const membership = await Membership.findOne({ user: req.params.userId, status: 'ACTIVE' }).populate('plan', 'name price duration').lean();
    res.json({ membership: membership ? await serializeMembership(membership) : null });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Memberships can only become ACTIVE through a completed payment or an
// explicit admin-authorized complimentary grant (complimentary: true). Any
// other creation lands in PENDING so it cannot grant gym access silently.
router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { userId, planId, startDate, autoRenew, complimentary } = req.body;

    const target = await User.findById(userId).select('role').lean();
    if (!target || target.role !== 'member') {
      return res.status(400).json({ message: 'Selected user is not a member' });
    }

    const plan = await MembershipPlan.findById(planId);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });

    const isComplimentary = complimentary === true;
    const start = startDate ? new Date(startDate) : new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + plan.duration);

    if (isComplimentary) {
      const existingActive = await Membership.findOne({ user: userId, status: 'ACTIVE' });
      if (existingActive) {
        existingActive.status = 'CANCELLED';
        await existingActive.save();
        await logAudit({
          actor: req.user._id,
          user: existingActive.user,
          action: 'cancelled',
          entity: 'Membership',
          entityId: existingActive._id,
          reason: 'superseded by a new complimentary grant'
        });
      }
    }

    const membership = await Membership.create({
      user: userId,
      plan: planId,
      startDate: start,
      endDate: end,
      status: isComplimentary ? 'ACTIVE' : 'PENDING',
      autoRenew: Boolean(autoRenew),
      ...(isComplimentary ? { activatedAt: new Date() } : {})
    });

    if (isComplimentary) await applyEntitlement(membership._id);

    await logAudit({
      actor: req.user._id,
      user: userId,
      action: isComplimentary ? 'activated' : 'created',
      entity: 'Membership',
      entityId: membership._id,
      reason: isComplimentary ? 'admin complimentary grant' : 'pending membership created',
      metadata: { plan: String(planId), status: membership.status }
    });

    const populated = await membership.populate(['plan', 'user']);
    res.status(201).json({ membership: populated });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Renewal is an offline/counter-legacy action: it grants ACTIVE status
// without an online payment, so the admin MUST explicitly acknowledge that
// the renewal is handled outside the system (counter/cash/complimentary).
// Without `acknowledged: true` the request is rejected rather than silently
// activating a membership.
router.put('/:id/renew', auth, authorize('admin'), async (req, res) => {
  try {
    if (req.body.acknowledged !== true) {
      return res.status(400).json({
        message: 'Renewing a membership requires explicit acknowledgement. Pass acknowledged: true to confirm the renewal is handled at the counter.'
      });
    }

    const membership = await Membership.findById(req.params.id).populate('plan');
    if (!membership) return res.status(404).json({ message: 'Membership not found' });

    const newStart = new Date();
    const newEnd = new Date(newStart);
    newEnd.setDate(newEnd.getDate() + membership.plan.duration);

    membership.startDate = newStart;
    membership.endDate = newEnd;
    membership.status = 'ACTIVE';
    membership.activatedAt = new Date();
    await membership.save();

    await applyEntitlement(membership._id);

    await logAudit({
      actor: req.user._id,
      user: membership.user,
      action: 'renewed',
      entity: 'Membership',
      entityId: membership._id,
      reason: 'counter renewal (acknowledged)',
      metadata: { plan: String(membership.plan._id), durationDays: membership.plan.duration }
    });

    res.json({ membership });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin suspends an ACTIVE membership. Suspension is an operation-level hold
// (e.g. rule breach, pending legal/financial issue): the member's access is
// revoked but the record and its history stay intact, and the membership can
// be reactivated without a new payment. Only admins can suspend/reactivate.
router.put('/:id/suspend', auth, authorize('admin'), async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim();
    const membership = await Membership.findById(req.params.id);
    if (!membership) return res.status(404).json({ message: 'Membership not found' });
    if (membership.status !== 'ACTIVE') {
      return res.status(400).json({ message: 'Only an ACTIVE membership can be suspended' });
    }
    membership.status = 'SUSPENDED';
    membership.suspendedReason = reason || 'Suspended by admin';
    membership.suspendedAt = new Date();
    await membership.save();
    await logAudit({
      actor: req.user._id,
      user: membership.user,
      action: 'suspended',
      entity: 'Membership',
      entityId: membership._id,
      reason: membership.suspendedReason
    });
    await Notification.create({
      user: membership.user,
      title: 'Membership suspended',
      message: `Your membership has been suspended${reason ? `: ${reason}` : ''}. Contact the gym for details.`,
      type: 'general'
    });
    res.json({ membership });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Reactive a SUSPENDED membership. A date that has already passed cannot come
// back to life: if the window is over the membership moves to EXPIRED instead.
router.put('/:id/reactivate', auth, authorize('admin'), async (req, res) => {
  try {
    const membership = await Membership.findById(req.params.id);
    if (!membership) return res.status(404).json({ message: 'Membership not found' });
    if (membership.status !== 'SUSPENDED') {
      return res.status(400).json({ message: 'Only a SUSPENDED membership can be reactivated' });
    }
    const now = new Date();
    membership.status = membership.endDate >= now ? 'ACTIVE' : 'EXPIRED';
    membership.suspendedReason = '';
    membership.suspendedAt = null;
    await membership.save();
    await logAudit({
      actor: req.user._id,
      user: membership.user,
      action: membership.status === 'ACTIVE' ? 'reactivated' : 'expired',
      entity: 'Membership',
      entityId: membership._id,
      reason: 'admin reactivation' + (membership.status === 'EXPIRED' ? ' (window already passed)' : '')
    });
    if (membership.status === 'ACTIVE') {
      await applyEntitlement(membership._id);
      await Notification.create({
        user: membership.user,
        title: 'Membership reactivated',
        message: 'Your membership has been reactivated.',
        type: 'general'
      });
    }
    res.json({ membership });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id/cancel', auth, authorize('admin'), async (req, res) => {
  try {
    const membership = await Membership.findByIdAndUpdate(
      req.params.id,
      { status: 'CANCELLED' },
      { new: true }
    );
    if (!membership) return res.status(404).json({ message: 'Membership not found' });
    await logAudit({
      actor: req.user._id,
      user: membership.user,
      action: 'cancelled',
      entity: 'Membership',
      entityId: membership._id,
      reason: String(req.body.reason || 'cancelled by admin').trim()
    });
    res.json({ membership });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/stats', auth, authorize('admin'), async (req, res) => {
  try {
    const now = new Date();
    const thirtyDays = new Date(now);
    thirtyDays.setDate(thirtyDays.getDate() + 30);

    const [statusCounts, expiringSoon] = await Promise.all([
      Membership.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Membership.countDocuments({ status: 'ACTIVE', endDate: { $lte: thirtyDays, $gte: now } })
    ]);

    const counts = { active: 0, expired: 0, pending: 0, cancelled: 0, suspended: 0 };
    for (const s of statusCounts) {
      const key = String(s._id).toLowerCase();
      if (key in counts) counts[key] = s.count;
    }

    res.json({ ...counts, expiringSoon });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin membership detail with the payment ledger against it. Highlights how
// far an INSTALLMENT membership has been covered and what remains.
router.get('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const membership = await Membership.findById(req.params.id)
      .populate('user', 'name email')
      .populate('plan')
      .lean();
    if (!membership) return res.status(404).json({ message: 'Membership not found' });

    const payments = await Payment.find({ membership: membership._id })
      .select('amount method status date transactionId')
      .sort({ date: -1 })
      .lean();
    const paidTotal = payments
      .filter((p) => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const enriched = await serializeMembership(membership);

    res.json({
      membership: { ...membership, ...enriched },
      payments,
      paidTotal,
      remaining: Math.max((Number(membership.plan?.price) || 0) - paidTotal, 0)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
