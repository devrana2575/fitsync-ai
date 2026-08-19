const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const Membership = require('../models/Membership');
const { auth, authorize } = require('../middleware/auth');

router.get('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 20, status, userId, startDate, endDate } = req.query;
    const filter = {};
    if (status) filter.status = status;
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
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.json({ payments, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/my', auth, async (req, res) => {
  try {
    const payments = await Payment.find({ user: req.user._id })
      .sort({ date: -1 });
    res.json({ payments });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { userId, membershipId, amount, method, transactionId, notes, status } = req.body;

    const payment = await Payment.create({
      user: userId,
      membership: membershipId,
      amount,
      method: method || 'cash',
      transactionId,
      notes,
      status: status || 'COMPLETED',
      date: new Date()
    });

    if (payment.status === 'COMPLETED' && membershipId) {
      await Membership.findByIdAndUpdate(membershipId, { status: 'ACTIVE' });
    }

    res.status(201).json({ payment });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const payment = await Payment.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    res.json({ payment });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
