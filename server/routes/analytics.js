const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Membership = require('../models/Membership');
const Payment = require('../models/Payment');
const WorkoutLog = require('../models/WorkoutLog');
const { auth, authorize } = require('../middleware/auth');
const {
  getGymDayStart,
  getGymDayEnd,
  getGymMonthStart,
  getGymTimezone,
  getGymWeekdayName,
  getGymDateKey
} = require('../utils/gymTime');

router.get('/admin/dashboard', auth, authorize('admin'), async (req, res) => {
  try {
    const now = new Date();
    const thirtyDays = new Date(now);
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const today = getGymDayStart();
    const tomorrow = getGymDayEnd();
    const startOfMonth = getGymMonthStart();
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const expiringFilter = { status: 'ACTIVE', endDate: { $lte: thirtyDays, $gte: now } };
    const [totalMembers, activeMembers, totalTrainers, activeMemberships, expiringSoon,
      expiringMembers, totalRevenue, pendingPayments, todayAttendance, monthlyAttendance, newMembers]
      = await Promise.all([
        User.countDocuments({ role: 'member' }),
        User.countDocuments({ role: 'member', isActive: true }),
        User.countDocuments({ role: 'trainer', isActive: true }),
        Membership.countDocuments({ status: 'ACTIVE' }),
        Membership.countDocuments(expiringFilter),
        Membership.find(expiringFilter).populate('user', 'name email').populate('plan', 'name')
          .sort({ endDate: 1 }).limit(5).lean(),
        Payment.aggregate([{ $match: { status: 'COMPLETED' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Payment.aggregate([{ $match: { status: 'PENDING' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Attendance.countDocuments({ date: { $gte: today, $lt: tomorrow } }),
        Attendance.countDocuments({ date: { $gte: startOfMonth } }),
        User.countDocuments({ role: 'member', createdAt: { $gte: oneMonthAgo } })
      ]);

    const retentionRate = totalMembers > 0 ? ((activeMembers / totalMembers) * 100).toFixed(1) : 0;

    res.json({
      totalMembers,
      activeMembers,
      totalTrainers,
      activeMemberships,
      expiringSoon,
      expiringMembers,
      totalRevenue: totalRevenue[0]?.total || 0,
      pendingPayments: pendingPayments[0]?.total || 0,
      todayAttendance,
      monthlyAttendance,
      newMembers,
      retentionRate: parseFloat(retentionRate)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/admin/revenue-trend', auth, authorize('admin'), async (req, res) => {
  try {
    const tz = getGymTimezone();
    const trend = await Payment.aggregate([
      { $match: { status: 'COMPLETED' } },
      {
        $group: {
          _id: { year: { $year: { date: '$date', timezone: tz } }, month: { $month: { date: '$date', timezone: tz } } },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      // Latest 12 months by gym-local calendar, then reversed to ascending
      // display order (fixes the previous oldest-12 bug).
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);
    // Convert to ascending display order (oldest of the last 12 first).
    const sorted = trend.sort((a, b) => (a._id.year - b._id.year) || (a._id.month - b._id.month));
    res.json({ trend: sorted });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/admin/attendance-trend', auth, authorize('admin'), async (req, res) => {
  try {
    const tz = getGymTimezone();
    const thirtyDaysAgo = getGymDayStart(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const trend = await Attendance.aggregate([
      { $match: { date: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: tz } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    res.json({ trend });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/admin/membership-distribution', auth, authorize('admin'), async (req, res) => {
  try {
    const distribution = await Membership.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    res.json({ distribution });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/admin/peak-hours', auth, authorize('admin'), async (req, res) => {
  try {
    const tz = getGymTimezone();
    const start = getGymDayStart(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const peakHours = await Attendance.aggregate([
      { $match: { date: { $gte: start } } },
      { $group: { _id: { $hour: { date: '$checkInTime', timezone: tz } }, count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    res.json({ peakHours });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/admin/monthly-revenue', auth, authorize('admin'), async (req, res) => {
  try {
    const tz = getGymTimezone();
    const data = await Payment.aggregate([
      { $match: { status: 'COMPLETED' } },
      {
        $group: {
          _id: { year: { $year: { date: '$date', timezone: tz } }, month: { $month: { date: '$date', timezone: tz } } },
          total: { $sum: '$amount' }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);
    res.json({ data });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/member/dashboard', auth, async (req, res) => {
  try {
    const userId = req.user._id;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const startOfToday = getGymDayStart();
    const startOfTomorrow = getGymDayEnd();

    const todayName = getGymWeekdayName();
    const WorkoutPlan = require('../models/WorkoutPlan');
    const BodyMeasurement = require('../models/BodyMeasurement');

    const [membership, totalDays, recentDays, totalWorkouts, recentWorkouts, latestMeasurement,
      todayAttendance, todayWorkout] = await Promise.all([
      Membership.findOne({ user: userId, status: 'ACTIVE' }).populate('plan', 'name price duration').lean(),
      Attendance.countDocuments({ user: userId }),
      Attendance.countDocuments({ user: userId, date: { $gte: thirtyDaysAgo } }),
      WorkoutLog.countDocuments({ user: userId }),
      WorkoutLog.countDocuments({ user: userId, date: { $gte: thirtyDaysAgo } }),
      BodyMeasurement.findOne({ user: userId }).sort({ date: -1 }).lean(),
      Attendance.findOne({ user: userId, checkInTime: { $gte: startOfToday, $lt: startOfTomorrow } }).select('checkOutTime').lean(),
      WorkoutPlan.findOne({ member: userId, isActive: true, dayOfWeek: todayName })
        .populate('exercises.exercise', 'name category muscleGroup')
        .populate('trainer', 'name').lean()
    ]);

    const attendancePercentage = Math.min(100, Math.round((recentDays / 30) * 100));

    res.json({
      membership,
      totalDays,
      attendancePercentage,
      totalWorkouts,
      recentWorkouts,
      latestMeasurement,
      todayCheckIn: todayAttendance ? true : false,
      todayCheckOut: todayAttendance?.checkOutTime ? true : false,
      todayWorkout: todayWorkout || null
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/trainer/dashboard', auth, authorize('trainer'), async (req, res) => {
  try {
    const trainerId = req.user._id;
    const MemberProfile = require('../models/MemberProfile');
    const Membership = require('../models/Membership');

    const assignedMembers = await MemberProfile.find({ assignedTrainer: trainerId }).populate('user', 'name email isActive').lean();
    const memberIds = assignedMembers.map(m => m.user._id);
    const memberIdStrings = memberIds.map(String);

    const today = getGymDayStart();
    const tomorrow = getGymDayEnd();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const now = Date.now();
    const expiryCutoff = new Date();
    expiryCutoff.setDate(expiryCutoff.getDate() + 30);

    const [todayAttendance, recentWorkouts, lastVisits, expiringMemberships] = await Promise.all([
      Attendance.countDocuments({ user: { $in: memberIds }, date: { $gte: today, $lt: tomorrow } }),
      WorkoutLog.countDocuments({ user: { $in: memberIds }, date: { $gte: thirtyDaysAgo } }),
      memberIds.length > 0
        ? Attendance.aggregate([
            { $match: { user: { $in: memberIds } } },
            { $sort: { checkInTime: -1 } },
            { $group: { _id: '$user', lastCheckIn: { $first: '$checkInTime' } } }
          ])
        : Promise.resolve([]),
      memberIds.length > 0
        ? Membership.find({ user: { $in: memberIds }, status: 'ACTIVE', endDate: { $gte: new Date(), $lte: expiryCutoff } })
            .select('user endDate plan').populate('plan', 'name').lean()
        : Promise.resolve([])
    ]);

    const lastVisitMap = new Map(lastVisits.map(v => [String(v._id), v.lastCheckIn]));
    const expiringMembershipMap = new Map(expiringMemberships.map(m => [String(m.user), m]));

    // Attention thresholds deliberately match existing business rules documented in
    // server/utils/cron.js (low_attendance = no visit for 7+ days) and the admin
    // dashboard expiringSoon window (membership ending within 30 days).
    const ATTENDANCE_STALE_DAYS = 7;
    const memberIdLookup = new Set(memberIdStrings);
    const members = assignedMembers.map(m => {
      const id = String(m.user._id);
      if (!memberIdLookup.has(id)) return { ...m, lastVisit: null, attention: [] };
      const lastVisit = lastVisitMap.get(id) || null;
      const attention = [];
      if (!lastVisit || (now - new Date(lastVisit).getTime()) > ATTENDANCE_STALE_DAYS * 24 * 60 * 60 * 1000) {
        attention.push('no_recent_attendance');
      }
      if (expiringMembershipMap.has(id)) attention.push('membership_expiring');
      return { ...m, lastVisit, attention };
    });

    res.json({
      totalAssigned: assignedMembers.length,
      members,
      todayAttendance,
      recentWorkouts
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
