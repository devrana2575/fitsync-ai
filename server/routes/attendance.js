const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const Membership = require('../models/Membership');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const { parsePagination } = require('../utils/helpers');
const { getTrainerAccessibleMemberIds, canTrainerAccessMember } = require('../utils/access');
const {
  getGymDayStart,
  getGymDayEnd,
  getGymDayStartOnDateKey,
  getGymDateKey,
  getGymMonthStart,
  getGymTimezone
} = require('../utils/gymTime');

// A member can only enter the gym with an ACTIVE membership that has not yet
// expired. The endDate comparison is instant-based (timezone independent), so
// a membership whose endDate is later today still passes.
const requireActiveMembership = async (userId) => {
  const membership = await Membership.findOne({
    user: userId,
    status: 'ACTIVE',
    endDate: { $gte: new Date() }
  }).select('_id status endDate').lean();
  return membership || null;
};

const findTodayFilter = () => {
  const dayKey = getGymDateKey();
  const dayStart = getGymDayStart();
  const dayEnd = getGymDayEnd();
  return {
    $or: [
      { dayKey },
      { date: { $gte: dayStart, $lt: dayEnd } }
    ]
  };
};

router.get('/', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query.page, req.query.limit, 1, 30, 100);
    const { date, userId } = req.query;
    const filter = {};
    if (userId) filter.user = userId;
    if (date) {
      const start = getGymDayStartOnDateKey(date);
      const end = getGymDayEnd(new Date(start.getTime() + 1));
      filter.date = { $gte: start, $lt: end };
    }
    // Trainers only ever pull attendance for members they may coach.
    if (req.user.role === 'trainer') {
      const accessible = await getTrainerAccessibleMemberIds(req.user._id);
      if (accessible.length === 0) return res.json({ records: [], total: 0, page, pages: 0 });
      filter.user = { $in: accessible };
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
    let ids = userIds.split(',').filter(Boolean);
    if (ids.length === 0) return res.json({ records: [], count: 0 });

    // Trainers may only batch-inspect members they are entitled to coach;
    // silently narrow the requested set to what the trainer may see.
    if (req.user.role === 'trainer') {
      const accessible = await getTrainerAccessibleMemberIds(req.user._id);
      const accessibleSet = new Set(accessible);
      ids = ids.filter((id) => accessibleSet.has(String(id)));
    }
    if (ids.length === 0) return res.json({ records: [], count: 0 });

    const filter = { user: { $in: ids } };
    if (date) {
      filter.date = {
        $gte: getGymDayStartOnDateKey(date),
        $lt: getGymDayEnd(new Date(getGymDayStartOnDateKey(date).getTime() + 1))
      };
    } else {
      filter.$or = [
        { dayKey: getGymDateKey() },
        { date: { $gte: getGymDayStart(), $lt: getGymDayEnd() } }
      ];
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
    const filter = findTodayFilter();
    const count = await Attendance.countDocuments(filter);
    const records = await Attendance.find(filter)
      .select('user date dayKey checkInTime checkOutTime')
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
    const monthStart = getGymMonthStart();
    const tz = getGymTimezone();

    const [todayCount, monthlyRecords, hourlyDistribution] = await Promise.all([
      Attendance.countDocuments(findTodayFilter()),
      Attendance.aggregate([
        { $match: { date: { $gte: monthStart } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: tz } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Attendance.aggregate([
        { $match: { date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
        { $group: { _id: { $hour: { date: '$checkInTime', timezone: tz } }, count: { $sum: 1 } } },
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
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const target = await User.findById(userId).select('_id role isActive').lean();
    if (!target || target.role !== 'member') {
      return res.status(404).json({ message: 'Member not found' });
    }
    if (!target.isActive) {
      return res.status(403).json({ message: 'Member is deactivated' });
    }
    // Trainers may only check in members they are entitled to coach.
    if (req.user.role === 'trainer') {
      const entitled = await canTrainerAccessMember(req.user._id, user._id);
      if (!entitled) return res.status(403).json({ message: 'Access denied' });
    }

    const membership = await requireActiveMembership(userId);
    if (!membership) {
      return res.status(403).json({ message: 'Active membership required for check-in' });
    }

    const dayKey = getGymDateKey();
    const existing = await Attendance.findOne({ user: userId, dayKey });
    if (existing) {
      return res.status(400).json({ message: 'Already checked in today' });
    }

    const now = new Date();
    let attendance;
    try {
      attendance = await Attendance.create({
        user: userId,
        date: now,
        dayKey,
        checkInTime: now,
        method: method || 'manual'
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ message: 'Already checked in today' });
      }
      throw error;
    }
    res.status(201).json({ attendance });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/checkout/:id', auth, async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id);
    if (!attendance) return res.status(404).json({ message: 'Attendance not found' });
    if (attendance.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }
    // A trainer only checks out members they are entitled to coach.
    if (req.user.role === 'trainer') {
      const entitled = await canTrainerAccessMember(req.user._id, attendance.user);
      if (!entitled) return res.status(403).json({ message: 'Access denied' });
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

    const membership = await requireActiveMembership(userId);
    if (!membership) {
      return res.status(403).json({ message: 'Active membership required for check-in' });
    }

    const dayKey = getGymDateKey();
    const existing = await Attendance.findOne({ user: userId, dayKey });
    if (existing) {
      return res.status(400).json({ message: 'Already checked in today' });
    }

    const now = new Date();
    let attendance;
    try {
      attendance = await Attendance.create({
        user: userId,
        date: now,
        dayKey,
        checkInTime: now,
        method: 'qr'
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ message: 'Already checked in today' });
      }
      throw error;
    }
    res.status(201).json({ attendance });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;