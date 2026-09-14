const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const Membership = require('../models/Membership');
const Notification = require('../models/Notification');
const { auth, authorize } = require('../middleware/auth');
const { parsePagination } = require('../utils/helpers');

// A completed payment activates its linked membership when the membership is
// not already active. Expired/pending memberships get a fresh active window
// computed from the plan duration; active memberships are left untouched
// (renewals are handled by the dedicated renew endpoint).
const activateMembershipFromPayment = async (membershipId) => {
  if (!membershipId) return;
  const membership = await Membership.findById(membershipId).populate('plan');
  if (!membership || membership.status === 'ACTIVE' || membership.status === 'CANCELLED') return;

  await Membership.updateMany(
    { user: membership.user, status: 'ACTIVE', _id: { $ne: membership._id } },
    { status: 'CANCELLED' }
  );

  const now = new Date();
  if (membership.status === 'EXPIRED' || !membership.endDate || membership.endDate <= now) {
    const start = new Date();
    const end = new Date(start);
    if (membership.plan && membership.plan.duration) {
      end.setDate(end.getDate() + membership.plan.duration);
    }
    membership.startDate = start;
    membership.endDate = end;
  }
  membership.status = 'ACTIVE';
  await membership.save();
};

const notifyPaymentReceived = async (userId, amount) => {
  if (!userId) return;
  await Notification.create({
    user: userId,
    title: 'Payment Received',
    message: `We received a payment of ₹${Number(amount || 0).toLocaleString('en-IN')}. Thank you!`,
    type: 'general'
  });
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
      .populate('user', 'name email')
      .populate('membership')
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({ payments, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/my', auth, async (req, res) => {
  try {
    const payments = await Payment.find({ user: req.user._id })
      .populate({ path: 'membership', populate: { path: 'plan', select: 'name' } })
      .sort({ date: -1 });
    res.json({ payments });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { userId, membershipId, amount, method, transactionId, notes, status } = req.body;
    const normalizedStatus = (status || 'COMPLETED').toUpperCase();

    const payment = await Payment.create({
      user: userId,
      membership: membershipId,
      amount,
      method: method || 'cash',
      transactionId,
      notes,
      status: normalizedStatus,
      date: new Date()
    });

    if (payment.status === 'COMPLETED') {
      await activateMembershipFromPayment(membershipId);
      await notifyPaymentReceived(userId, amount);
    }

    res.status(201).json({ payment });
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
    if (status !== undefined) update.status = status.toUpperCase();

    const existing = await Payment.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Payment not found' });

    const payment = await Payment.findByIdAndUpdate(req.params.id, update, { new: true });

    if (payment.status === 'COMPLETED') {
      await activateMembershipFromPayment(payment.membership);
      await notifyPaymentReceived(payment.user, payment.amount);
    }

    res.json({ payment });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/stats', auth, authorize('admin'), async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const totalRevenue = await Payment.aggregate([
      { $match: { status: 'COMPLETED' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const monthlyRevenue = await Payment.aggregate([
      { $match: { status: 'COMPLETED', date: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const pendingAmount = await Payment.aggregate([
      { $match: { status: 'PENDING' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const monthlyTrend = await Payment.aggregate([
      { $match: { status: 'COMPLETED' } },
      {
        $group: {
          _id: { year: { $year: '$date' }, month: { $month: '$date' } },
          total: { $sum: '$amount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $limit: 12 }
    ]);

    res.json({
      totalRevenue: totalRevenue[0]?.total || 0,
      monthlyRevenue: monthlyRevenue[0]?.total || 0,
      pendingAmount: pendingAmount[0]?.total || 0,
      monthlyTrend
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
