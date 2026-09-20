const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const Payment = require('../models/Payment');
const Membership = require('../models/Membership');
const MembershipPlan = require('../models/MembershipPlan');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const { parsePagination } = require('../utils/helpers');
const { activateMembershipFromPayment } = require('../utils/membershipActivation');
const { getGymMonthStart, getGymTimezone } = require('../utils/gymTime');

const makeReceiptNumber = () => `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

const notifyPaymentReceived = async (userId, amount) => {
  if (!userId) return;
  await Notification.create({
    user: userId,
    title: 'Payment Received',
    message: `We received a payment of ₹${Number(amount || 0).toLocaleString('en-IN')}. Thank you!`,
    type: 'general'
  });
};

// Amount must match the plan price for plan-based completions, otherwise a
// zero/typo amount could activate a membership for free.
const validatePlanAmount = async ({ membershipId, planId, amount, status }) => {
  if (status !== 'COMPLETED') return null;

  let plan = null;
  if (planId) {
    plan = await MembershipPlan.findById(planId);
  } else if (membershipId) {
    const membership = await Membership.findById(membershipId).populate('plan');
    plan = membership?.plan || null;
  }

  if (!plan) return null; // member-directed amount without a linked plan - not enforced

  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return { error: 'Amount must be greater than zero' };
  }
  if (value !== Number(plan.price)) {
    return { error: `Amount does not match the ${plan.name} plan price (₹${plan.price})` };
  }
  return null;
};

const markAsConfirmed = async (payment, req) => {
  payment.confirmedBy = req.user._id;
  payment.confirmedAt = new Date();
  await payment.save();
};

router.get('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query.page, req.query.limit, 1, 20, 100);
    const { status, userId, startDate, endDate } = req.query;
    const filter = {};
    if (status) filter.status = status.toUpperCase();
    if (userId) filter.user = userId;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const total = await Payment.countDocuments(filter);
    const payments = await Payment.find(filter)
      .select('user amount method status date membership transactionId notes confirmedBy confirmedAt')
      .populate('user', 'name email')
      .populate('membership', 'plan startDate endDate status')
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({ payments, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/my', auth, async (req, res) => {
  try {
    const payments = await Payment.find({ user: req.user._id })
      .select('user amount method status date membership')
      .populate({ path: 'membership', populate: { path: 'plan', select: 'name' } })
      .sort({ date: -1 })
      .limit(100)
      .lean();
    res.json({ payments });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin records a counter/cash/UPI payment.
router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { userId, membershipId, planId, amount, method, transactionId, notes, status } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const target = await User.findById(userId).select('role').lean();
    if (!target || target.role !== 'member') {
      return res.status(400).json({ message: 'Selected user is not a member' });
    }

    const normalizedStatus = (status || 'COMPLETED').toUpperCase();

    const amountError = await validatePlanAmount({ membershipId, planId, amount, status: normalizedStatus });
    if (amountError) return res.status(400).json({ message: amountError.error });

    let targetMembership = membershipId || null;

    if (!targetMembership && planId) {
      const plan = await MembershipPlan.findById(planId);
      if (!plan) return res.status(404).json({ message: 'Plan not found' });

      // Reuse an existing PENDING membership for this user + plan (e.g. one
      // created by the Assign flow) so we don't duplicate pending rows.
      const existingPending = await Membership.findOne({ user: userId, plan: plan._id, status: 'PENDING' });
      if (existingPending) {
        targetMembership = existingPending._id;
      } else {
        const start = new Date();
        const end = new Date(start);
        end.setDate(end.getDate() + plan.duration);

        // Always created PENDING - activation happens only through
        // activateMembershipFromPayment() once the payment is COMPLETED.
        const membership = await Membership.create({
          user: userId,
          plan: plan._id,
          startDate: start,
          endDate: end,
          status: 'PENDING',
          autoRenew: false
        });
        targetMembership = membership._id;
      }
    }

    const payment = await Payment.create({
      user: userId,
      membership: targetMembership,
      amount,
      method: method || 'cash',
      transactionId: transactionId || makeReceiptNumber(),
      notes,
      status: normalizedStatus,
      date: new Date(),
      confirmedBy: normalizedStatus === 'COMPLETED' ? req.user._id : undefined,
      confirmedAt: normalizedStatus === 'COMPLETED' ? new Date() : undefined
    });

    if (payment.status === 'COMPLETED') {
      await activateMembershipFromPayment(targetMembership);
      await notifyPaymentReceived(userId, amount);
    }

    res.status(201).json({ payment });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Authorized admin verification for payments that the member claims but which
// cannot be confirmed automatically (UPI scan-to-pay). Records who confirmed
// and when, then activates the membership through the shared activation path.
router.post('/:id/verify', auth, authorize('admin'), async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if (payment.status === 'COMPLETED') {
      return res.json({ message: 'Payment already completed', payment });
    }
    if (payment.status === 'REFUNDED') {
      return res.status(400).json({ message: 'A refunded payment cannot be approved' });
    }

    const amountError = await validatePlanAmount({ membershipId: String(payment.membership || ''), amount: payment.amount, status: 'COMPLETED' });
    if (amountError) return res.status(400).json({ message: amountError.error });

    payment.status = 'COMPLETED';
    payment.confirmedBy = req.user._id;
    payment.confirmedAt = new Date();
    payment.notes = `${payment.notes || ''} (verified by ${req.user.name || req.user._id})`.trim();
    await payment.save();

    await activateMembershipFromPayment(payment.membership);
    await notifyPaymentReceived(payment.user, payment.amount);

    res.json({ message: 'Payment verified and completed', payment });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { amount, method, transactionId, notes, status } = req.body;
    const update = {};
    if (amount !== undefined) update.amount = amount;
    if (method !== undefined) update.method = method;
    if (transactionId !== undefined) update.transactionId = transactionId;
    if (notes !== undefined) update.notes = notes;

    const existing = await Payment.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Payment not found' });

    const nextStatus = status !== undefined ? status.toUpperCase() : existing.status;
    if (nextStatus === 'COMPLETED') {
      const amountError = await validatePlanAmount({ membershipId: String(existing.membership || ''), amount: amount ?? existing.amount, status: 'COMPLETED' });
      if (amountError) return res.status(400).json({ message: amountError.error });
      update.status = 'COMPLETED';
      update.confirmedBy = req.user._id;
      update.confirmedAt = new Date();
    } else if (status !== undefined) {
      update.status = nextStatus;
      if (nextStatus === 'REFUNDED') {
        update.confirmedBy = req.user._id;
        update.confirmedAt = new Date();
      } else if (nextStatus !== 'PENDING' && nextStatus !== 'FAILED') {
        return res.status(400).json({ message: 'Invalid payment status' });
      }
    }

    const payment = await Payment.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    );

    if (payment.status === 'COMPLETED' && existing.status !== 'COMPLETED') {
      await activateMembershipFromPayment(payment.membership);
      await notifyPaymentReceived(payment.user, payment.amount);
    }

    if (payment.status === 'REFUNDED' && payment.membership) {
      // A refunded payment must not leave the member with active access.
      const membership = await Membership.findById(payment.membership);
      if (membership && membership.status === 'ACTIVE') {
        membership.status = 'CANCELLED';
        await membership.save();
      }
    }

    res.json({ payment });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/stats', auth, authorize('admin'), async (req, res) => {
  try {
    const monthStart = getGymMonthStart();
    const tz = getGymTimezone();

    const [totalRevenue, monthlyRevenue, pendingAmount, monthlyTrend] = await Promise.all([
      Payment.aggregate([
        { $match: { status: 'COMPLETED' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Payment.aggregate([
        { $match: { status: 'COMPLETED', date: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Payment.aggregate([
        { $match: { status: 'PENDING' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Payment.aggregate([
        { $match: { status: 'COMPLETED' } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$date', timezone: tz } },
            total: { $sum: '$amount' }
          }
        },
        { $sort: { _id: -1 } },
        { $limit: 12 }
      ])
    ]);

    const trend = monthlyTrend.map((t) => {
      const [year, month] = t._id.split('-');
      return { year: Number(year), month: Number(month), total: t.total };
    });

    res.json({
      totalRevenue: totalRevenue[0]?.total || 0,
      monthlyRevenue: monthlyRevenue[0]?.total || 0,
      pendingAmount: pendingAmount[0]?.total || 0,
      monthlyTrend: trend
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;