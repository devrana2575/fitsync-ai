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

router.get('/admin/revenue', auth, authorize('admin'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = { status: 'COMPLETED' };
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }
    const payments = await Payment.find(filter).populate('user', 'name email').sort({ date: -1 });
    const total = payments.reduce((sum, p) => sum + p.amount, 0);
    res.json({ report: 'Revenue Report', data: payments, total });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/admin/memberships', auth, authorize('admin'), async (req, res) => {
  try {
    const memberships = await Membership.find().populate('user', 'name email').populate('plan').sort({ createdAt: -1 });
    const summary = {
      active: memberships.filter(m => m.status === 'ACTIVE').length,
      expired: memberships.filter(m => m.status === 'EXPIRED').length,
      pending: memberships.filter(m => m.status === 'PENDING').length,
      cancelled: memberships.filter(m => m.status === 'CANCELLED').length
    };
    res.json({ report: 'Membership Report', data: memberships, summary });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/admin/attendance', auth, authorize('admin'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = {};
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }
    const records = await Attendance.find(filter).populate('user', 'name email').sort({ date: -1 });
    const uniqueMembers = [...new Set(records.map(r => r.user?._id?.toString()))].filter(Boolean);
    res.json({ report: 'Attendance Report', data: records, totalRecords: records.length, uniqueMembers: uniqueMembers.length });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/member/progress', auth, async (req, res) => {
  try {
    const measurements = await BodyMeasurement.find({ user: req.user._id }).sort({ date: 1 });
    const workouts = await WorkoutLog.find({ user: req.user._id }).sort({ date: 1 });
    const attendance = await Attendance.find({ user: req.user._id }).sort({ date: 1 });
    res.json({ report: 'Personal Progress', measurements, workouts, attendance });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/trainer/member-progress/:memberId', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const measurements = await BodyMeasurement.find({ user: req.params.memberId }).sort({ date: 1 });
    const workouts = await WorkoutLog.find({ user: req.params.memberId }).sort({ date: -1 }).limit(30);
    const attendance = await Attendance.find({ user: req.params.memberId }).sort({ date: -1 }).limit(30);
    res.json({ measurements, workouts, attendance });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
