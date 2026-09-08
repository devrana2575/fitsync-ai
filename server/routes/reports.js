const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Payment = require('../models/Payment');
const Attendance = require('../models/Attendance');
const Membership = require('../models/Membership');
const WorkoutLog = require('../models/WorkoutLog');
const BodyMeasurement = require('../models/BodyMeasurement');
const MLPrediction = require('../models/MLPrediction');
const { auth, authorize } = require('../middleware/auth');
const { parsePagination } = require('../utils/helpers');

router.get('/admin/revenue', auth, authorize('admin'), async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query.page, req.query.limit, 1, 50, 200);
    const { startDate, endDate } = req.query;
    const filter = { status: 'COMPLETED' };
    const aggMatch = { status: 'COMPLETED' };
    if (startDate || endDate) {
      filter.date = {};
      aggMatch.date = {};
      if (startDate) { filter.date.$gte = new Date(startDate); aggMatch.date.$gte = new Date(startDate); }
      if (endDate) { filter.date.$lte = new Date(endDate); aggMatch.date.$lte = new Date(endDate); }
    }
    const total = await Payment.countDocuments(filter);
    const payments = await Payment.find(filter).populate('user', 'name email').sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    const totalResult = await Payment.aggregate([
      { $match: aggMatch },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalAmount = totalResult[0]?.total || 0;
    res.json({ report: 'Revenue Report', data: payments, total, totalAmount, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/admin/memberships', auth, authorize('admin'), async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query.page, req.query.limit, 1, 50, 200);
    const memberships = await Membership.find()
      .populate('user', 'name email').populate('plan')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    const summary = {
      active: 0,
      expired: 0,
      pending: 0,
      cancelled: 0
    };
    const statusCounts = await Membership.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    for (const s of statusCounts) {
      const key = String(s._id).toLowerCase();
      if (key in summary) summary[key] = s.count;
    }
    const total = await Membership.countDocuments();
    res.json({ report: 'Membership Report', data: memberships, summary, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/admin/attendance', auth, authorize('admin'), async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query.page, req.query.limit, 1, 50, 200);
    const { startDate, endDate } = req.query;
    const filter = {};
    const aggMatch = {};
    if (startDate || endDate) {
      filter.date = {};
      aggMatch.date = {};
      if (startDate) { filter.date.$gte = new Date(startDate); aggMatch.date.$gte = new Date(startDate); }
      if (endDate) { filter.date.$lte = new Date(endDate); aggMatch.date.$lte = new Date(endDate); }
    }
    const total = await Attendance.countDocuments(filter);
    const records = await Attendance.find(filter).populate('user', 'name email').sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    const uniqueMembersResult = await Attendance.aggregate([
      { $match: aggMatch },
      { $group: { _id: '$user' } },
      { $count: 'uniqueMembers' }
    ]);
    const uniqueMembers = uniqueMembersResult[0]?.uniqueMembers || 0;
    res.json({ report: 'Attendance Report', data: records, total, page, pages: Math.ceil(total / limit), uniqueMembers });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/admin/ml-risk', auth, authorize('admin'), async (req, res) => {
  try {
    const predictions = await MLPrediction.find({ model: 'engagement_risk' })
      .populate('member', 'name email')
      .sort({ probability: -1 });
    const highRisk = predictions.filter(p => p.riskLevel === 'HIGH');
    const mediumRisk = predictions.filter(p => p.riskLevel === 'MEDIUM');
    const lowRisk = predictions.filter(p => p.riskLevel === 'LOW');
    res.json({ report: 'ML Risk Report', predictions, highRisk, mediumRisk, lowRisk });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/member/progress', auth, async (req, res) => {
  try {
    const measurements = await BodyMeasurement.find({ user: req.user._id }).sort({ date: 1 });
    const workouts = await WorkoutLog.find({ user: req.user._id }).sort({ date: 1 });
    const attendance = await Attendance.find({ user: req.user._id }).sort({ date: 1 });
    res.json({ report: 'Personal Progress', measurements, workouts, attendance });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/trainer/member-progress/:memberId', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const measurements = await BodyMeasurement.find({ user: req.params.memberId }).sort({ date: 1 });
    const workouts = await WorkoutLog.find({ user: req.params.memberId }).sort({ date: -1 }).limit(30);
    const attendance = await Attendance.find({ user: req.params.memberId }).sort({ date: -1 }).limit(30);
    res.json({ measurements, workouts, attendance });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
