const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const { auth, authorize } = require('../middleware/auth');

router.get('/', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const { page = 1, limit = 30, date, userId } = req.query;
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
      .populate('user', 'name email role')
      .sort({ checkInTime: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    res.json({ records, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/my', auth, async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const records = await Attendance.find({ user: req.user._id })
      .sort({ date: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    res.json({ records });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/today', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const records = await Attendance.find({ date: { $gte: today, $lt: tomorrow } }).populate('user', 'name email role');
    res.json({ records, count: records.length });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/stats', auth, authorize('admin'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayCount = await Attendance.countDocuments({ date: { $gte: today, $lt: tomorrow } });

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthlyRecords = await Attendance.aggregate([
      { $match: { date: { $gte: startOfMonth } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const hourlyDistribution = await Attendance.aggregate([
      { $match: { date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
      { $group: { _id: { $hour: '$checkInTime' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({ todayCount, monthlyRecords, hourlyDistribution });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/checkout/:id', auth, async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id);
    if (!attendance) return res.status(404).json({ message: 'Attendance not found' });
    attendance.checkOutTime = new Date();
    attendance.duration = Math.round((attendance.checkOutTime - attendance.checkInTime) / 60000);
    await attendance.save();
    res.json({ attendance });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
