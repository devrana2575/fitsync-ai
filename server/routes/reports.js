const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Payment = require('../models/Payment');
const Attendance = require('../models/Attendance');
const Membership = require('../models/Membership');
const WorkoutLog = require('../models/WorkoutLog');
const BodyMeasurement = require('../models/BodyMeasurement');
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
    const [total, payments, totalResult] = await Promise.all([
      Payment.countDocuments(filter),
      Payment.find(filter).select('user amount method status date').populate('user', 'name email').sort({ date: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Payment.aggregate([
        { $match: aggMatch },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
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
    const [memberships, statusCounts, total] = await Promise.all([
      Membership.find()
        .select('user plan startDate endDate status autoRenew')
        .populate('user', 'name email').populate('plan', 'name price duration')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Membership.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Membership.countDocuments()
    ]);
    const summary = {
      active: 0,
      expired: 0,
      pending: 0,
      cancelled: 0
    };
    for (const s of statusCounts) {
      const key = String(s._id).toLowerCase();
      if (key in summary) summary[key] = s.count;
    }
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
    const [total, records, uniqueMembersResult] = await Promise.all([
      Attendance.countDocuments(filter),
      Attendance.find(filter).select('user date checkInTime checkOutTime').populate('user', 'name email').sort({ date: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Attendance.aggregate([
        { $match: aggMatch },
        { $group: { _id: '$user' } },
        { $count: 'uniqueMembers' }
      ])
    ]);
    const uniqueMembers = uniqueMembersResult[0]?.uniqueMembers || 0;
    res.json({ report: 'Attendance Report', data: records, total, page, pages: Math.ceil(total / limit), uniqueMembers });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/member/progress', auth, async (req, res) => {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const filter = { user: req.user._id, date: { $gte: sixMonthsAgo } };

    const [measurements, workouts, attendance] = await Promise.all([
      BodyMeasurement.find(filter).select('date weight bodyFat').sort({ date: 1 }).lean(),
      WorkoutLog.find(filter).select('date exercise sets reps weight isCompleted').sort({ date: 1 }).lean(),
      Attendance.find(filter).select('date checkInTime checkOutTime').sort({ date: 1 }).lean()
    ]);
    res.json({ report: 'Personal Progress', measurements, workouts, attendance });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/trainer/member-progress/:memberId', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const [measurements, workouts, attendance] = await Promise.all([
      BodyMeasurement.find({ user: req.params.memberId }).select('date weight bodyFat').sort({ date: 1 }).lean(),
      WorkoutLog.find({ user: req.params.memberId }).select('date exercise sets reps weight isCompleted').sort({ date: -1 }).limit(30).lean(),
      Attendance.find({ user: req.params.memberId }).select('date checkInTime checkOutTime').sort({ date: -1 }).limit(30).lean()
    ]);
    res.json({ measurements, workouts, attendance });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
