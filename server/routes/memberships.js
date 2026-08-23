const express = require('express');
const router = express.Router();
const Membership = require('../models/Membership');
const MembershipPlan = require('../models/MembershipPlan');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const { auth, authorize } = require('../middleware/auth');

router.get('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 20, status, userId } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (userId) filter.user = userId;

    const total = await Membership.countDocuments(filter);
    const memberships = await Membership.find(filter)
      .populate('user', 'name email')
      .populate('plan')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.json({ memberships, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/my', auth, async (req, res) => {
  try {
    const memberships = await Membership.find({ user: req.user._id })
      .populate('plan')
      .sort({ createdAt: -1 });
    res.json({ memberships });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Per design 3.2.3 / 3.3.2: a Member renews their own membership, including
// payment validation and confirmation.
router.post('/my/renew', auth, async (req, res) => {
  try {
    const { method } = req.body;
    const allowedMethods = ['cash', 'card', 'upi', 'bank_transfer', 'online'];
    if (!method || !allowedMethods.includes(method)) {
      return res.status(400).json({ message: 'A valid payment method is required' });
    }

    const membership = await Membership.findOne({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate('plan');
    if (!membership || !membership.plan) {
      return res.status(404).json({ message: 'No membership found to renew. Please contact the gym administrator.' });
    }
    if (!membership.plan.isActive) {
      return res.status(400).json({ message: 'The selected plan is no longer available' });
    }

    const now = new Date();
    if (membership.status === 'ACTIVE' && new Date(membership.endDate) > now) {
      return res.status(400).json({
        message: `Membership is already active until ${new Date(membership.endDate).toLocaleDateString()}`
      });
    }

    const payment = await Payment.create({
      user: req.user._id,
      membership: membership._id,
      amount: membership.plan.price,
      method,
      status: 'PENDING'
    });

    payment.status = 'COMPLETED';
    await payment.save();

    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + membership.plan.duration);

    membership.startDate = start;
    membership.endDate = end;
    membership.status = 'ACTIVE';
    await membership.save();

    await Notification.create({
      user: req.user._id,
      title: 'Membership Renewed',
      message: `Your ${membership.plan.name} membership has been renewed until ${end.toLocaleDateString()}.`,
      type: 'membership_expiry',
      link: '/member'
    });

    const populated = await membership.populate(['plan', 'user']);
    res.json({ membership: populated, payment });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/active/:userId', auth, async (req, res) => {
  try {
    const membership = await Membership.findOne({ user: req.params.userId, status: 'ACTIVE' }).populate('plan');
    res.json({ membership });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { userId, planId, startDate, autoRenew } = req.body;

    const plan = await MembershipPlan.findById(planId);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });

    const start = startDate ? new Date(startDate) : new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + plan.duration);

    const existingActive = await Membership.findOne({ user: userId, status: 'ACTIVE' });
    if (existingActive) {
      existingActive.status = 'CANCELLED';
      await existingActive.save();
    }

    const membership = await Membership.create({
      user: userId,
      plan: planId,
      startDate: start,
      endDate: end,
      status: 'ACTIVE',
      autoRenew: autoRenew || false
    });

    const populated = await membership.populate(['plan', 'user']);
    res.status(201).json({ membership: populated });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id/renew', auth, authorize('admin'), async (req, res) => {
  try {
    const membership = await Membership.findById(req.params.id).populate('plan');
    if (!membership) return res.status(404).json({ message: 'Membership not found' });

    const newStart = new Date();
    const newEnd = new Date(newStart);
    newEnd.setDate(newEnd.getDate() + membership.plan.duration);

    membership.startDate = newStart;
    membership.endDate = newEnd;
    membership.status = 'ACTIVE';
    await membership.save();

    res.json({ membership });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
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
    res.json({ membership });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/stats', auth, authorize('admin'), async (req, res) => {
  try {
    const active = await Membership.countDocuments({ status: 'ACTIVE' });
    const expired = await Membership.countDocuments({ status: 'EXPIRED' });
    const pending = await Membership.countDocuments({ status: 'PENDING' });
    const cancelled = await Membership.countDocuments({ status: 'CANCELLED' });

    const now = new Date();
    const thirtyDays = new Date(now);
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const expiringSoon = await Membership.countDocuments({
      status: 'ACTIVE',
      endDate: { $lte: thirtyDays, $gte: now }
    });

    res.json({ active, expired, pending, cancelled, expiringSoon });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
