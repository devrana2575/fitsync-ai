const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const { auth, authorize } = require('../middleware/auth');
const { parsePagination } = require('../utils/helpers');

router.get('/', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query.page, req.query.limit, 1, 30, 100);
    const { date, userId } = req.query;
    const filter = {};
    if (userId) filter.user = userId;
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      filter.date = { $gte: start, $lt: end };
    }
    const total = await Attendance.countDocuments(filter);
    const records = await Attendance.find(filter)
      .select('user date checkInTime checkOutTime method duration')
      .populate('user', 'name email role')
      .sort({ checkInTime: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    res.json({ records, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/batch-today', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const { userIds, date } = req.query;
    if (!userIds) return res.status(400).json({ message: 'userIds is required' });
    const ids = userIds.split(',').filter(Boolean);
    if (ids.length === 0) return res.json({ records: [], count: 0 });

    const filter = { user: { $in: ids } };
    if (date) {
      const start = new Date(date);
      if (!isNaN(start.getTime())) {
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        filter.date = { $gte: start, $lt: end };
      }
    }

    const records = await Attendance.find(filter)
      .select('user date checkInTime checkOutTime method duration')
      .populate('user', 'name email role')
      .sort({ checkInTime: 1 })
      .limit(500)
      .lean();
    res.json({ records, count: records.length });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/my', auth, async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query.page, req.query.limit, 1, 30, 100);
    const records = await Attendance.find({ user: req.user._id })
      .select('date checkInTime checkOutTime method duration')
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    res.json({ records });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/today', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const filter = { date: { $gte: today, $lt: tomorrow } };
    const count = await Attendance.countDocuments(filter);
    const records = await Attendance.find(filter)
      .select('user date checkInTime checkOutTime')
      .populate('user', 'name email role')
      .sort({ checkInTime: 1 })
      .limit(200)
      .lean();
    res.json({ records, count });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/stats', auth, authorize('admin'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [todayCount, monthlyRecords, hourlyDistribution] = await Promise.all([
      Attendance.countDocuments({ date: { $gte: today, $lt: tomorrow } }),
      Attendance.aggregate([
        { $match: { date: { $gte: startOfMonth } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Attendance.aggregate([
        { $match: { date: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $hour: '$checkInTime' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ])
    ]);

    res.json({ todayCount, monthlyRecords, hourlyDistribution });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/checkin', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const { userId, method } = req.body;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existing = await Attendance.findOne({ user: userId, date: { $gte: today } });
    if (existing) {
      return res.status(400).json({ message: 'Already checked in today' });
    }
    const attendance = await Attendance.create({
      user: userId,
      date: new Date(),
      checkInTime: new Date(),
      method: method || 'manual'
    });
    res.status(201).json({ attendance });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/checkout/:id', auth, async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id);
    if (!attendance) return res.status(404).json({ message: 'Attendance not found' });
    if (attendance.user.toString() !== req.user._id.toString() && req.user.role !== 'admin' && req.user.role !== 'trainer') {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (attendance.checkOutTime) {
      return res.status(400).json({ message: 'Already checked out' });
    }
    attendance.checkOutTime = new Date();
    attendance.duration = Math.round((attendance.checkOutTime - attendance.checkInTime) / 60000);
    await attendance.save();
    res.json({ attendance });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/qr-checkin', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existing = await Attendance.findOne({ user: userId, date: { $gte: today } });
    if (existing) {
      return res.status(400).json({ message: 'Already checked in today' });
    }
    const attendance = await Attendance.create({
      user: userId,
      date: new Date(),
      checkInTime: new Date(),
      method: 'qr'
    });
    res.status(201).json({ attendance });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
