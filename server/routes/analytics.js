const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Membership = require('../models/Membership');
const Payment = require('../models/Payment');
const WorkoutLog = require('../models/WorkoutLog');
const { auth, authorize } = require('../middleware/auth');

router.get('/admin/dashboard', auth, authorize('admin'), async (req, res) => {
  try {
    const totalMembers = await User.countDocuments({ role: 'member' });
    const activeMembers = await User.countDocuments({ role: 'member', isActive: true });
    const totalTrainers = await User.countDocuments({ role: 'trainer', isActive: true });
    const activeMemberships = await Membership.countDocuments({ status: 'ACTIVE' });

    const now = new Date();
    const thirtyDays = new Date(now);
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const expiringSoon = await Membership.countDocuments({
      status: 'ACTIVE',
      endDate: { $lte: thirtyDays, $gte: now }
    });

    const expiringMembers = await Membership.find({
      status: 'ACTIVE',
      endDate: { $lte: thirtyDays, $gte: now }
    })
      .populate('user', 'name email')
      .populate('plan', 'name')
      .sort({ endDate: 1 })
      .limit(5);

    const totalRevenue = await Payment.aggregate([
      { $match: { status: 'COMPLETED' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const pendingPayments = await Payment.aggregate([
      { $match: { status: 'PENDING' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayAttendance = await Attendance.countDocuments({ date: { $gte: today, $lt: tomorrow } });

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyAttendance = await Attendance.countDocuments({ date: { $gte: startOfMonth } });

    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const newMembers = await User.countDocuments({
      role: 'member',
      createdAt: { $gte: oneMonthAgo }
    });

    const totalEnrolled = await User.countDocuments({ role: 'member', createdAt: { $lte: now } });
    const retained = await User.countDocuments({ role: 'member', isActive: true });
    const retentionRate = totalEnrolled > 0 ? ((retained / totalEnrolled) * 100).toFixed(1) : 0;

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
    const trend = await Payment.aggregate([
      { $match: { status: 'COMPLETED' } },
      {
        $group: {
          _id: { year: { $year: '$date' }, month: { $month: '$date' } },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $limit: 12 }
    ]);
    res.json({ trend });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/admin/attendance-trend', auth, authorize('admin'), async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const trend = await Attendance.aggregate([
      { $match: { date: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, count: { $sum: 1 } } },
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
    const peakHours = await Attendance.aggregate([
      { $match: { date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
      { $group: { _id: { $hour: '$checkInTime' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    res.json({ peakHours });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/admin/monthly-revenue', auth, authorize('admin'), async (req, res) => {
  try {
    const data = await Payment.aggregate([
      { $match: { status: 'COMPLETED' } },
      {
        $group: {
          _id: { year: { $year: '$date' }, month: { $month: '$date' } },
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

    const membership = await Membership.findOne({ user: userId, status: 'ACTIVE' }).populate('plan');

    const totalDays = await Attendance.countDocuments({ user: userId });
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentDays = await Attendance.countDocuments({ user: userId, date: { $gte: thirtyDaysAgo } });
    const attendancePercentage = Math.min(100, Math.round((recentDays / 30) * 100));

    const totalWorkouts = await WorkoutLog.countDocuments({ user: userId });
    const recentWorkouts = await WorkoutLog.countDocuments({ user: userId, date: { $gte: thirtyDaysAgo } });

    const latestMeasurement = await require('../models/BodyMeasurement').findOne({ user: userId }).sort({ date: -1 });

    // Today's attendance check
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    const todayAttendance = await Attendance.findOne({
      user: userId,
      checkInTime: { $gte: startOfToday, $lt: startOfTomorrow }
    });

    // Today's workout plan
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayName = dayNames[new Date().getDay()];
    const WorkoutPlan = require('../models/WorkoutPlan');
    const todayWorkout = await WorkoutPlan.findOne({
      member: userId,
      isActive: true,
      dayOfWeek: todayName
    }).populate('exercises.exercise').populate('trainer', 'name');

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

    const assignedMembers = await MemberProfile.find({ assignedTrainer: trainerId }).populate('user', 'name email isActive');
    const memberIds = assignedMembers.map(m => m.user._id);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayAttendance = await Attendance.countDocuments({
      user: { $in: memberIds },
      date: { $gte: today, $lt: tomorrow }
    });
    const Membership = require('../models/Membership');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentWorkouts = await WorkoutLog.countDocuments({
      user: { $in: memberIds },
      date: { $gte: thirtyDaysAgo }
    });

    const lastVisitMap = new Map();
    if (memberIds.length > 0) {
      const lastVisits = await Attendance.aggregate([
        { $match: { user: { $in: memberIds } } },
        { $sort: { checkInTime: -1 } },
        { $group: { _id: '$user', lastCheckIn: { $first: '$checkInTime' } } }
      ]);
      lastVisits.forEach(v => lastVisitMap.set(v._id.toString(), v.lastCheckIn));
    }

    // Attention thresholds deliberately match existing business rules documented in
    // server/utils/cron.js (low_attendance = no visit for 7+ days) and the admin
    // dashboard expiringSoon window (membership ending within 30 days).
    const ATTENDANCE_STALE_DAYS = 7;
    const EXPIRY_SOON_DAYS = 30;

    let expiringMembershipMap = new Map();
    if (memberIds.length > 0) {
      const now = new Date();
      const expiryCutoff = new Date();
      expiryCutoff.setDate(expiryCutoff.getDate() + EXPIRY_SOON_DAYS);
      const expiringMemberships = await Membership.find({
        user: { $in: memberIds },
        status: 'ACTIVE',
        endDate: { $gte: now, $lte: expiryCutoff }
      }).select('user endDate plan').populate('plan', 'name');
      expiringMembershipMap = new Map(expiringMemberships.map(m => [m.user.toString(), m]));
    }

    const now = Date.now();
    const members = assignedMembers.map(m => {
      const lastVisit = lastVisitMap.get(m.user._id.toString()) || null;
      const attention = [];
      if (!lastVisit || (now - new Date(lastVisit).getTime()) > ATTENDANCE_STALE_DAYS * 24 * 60 * 60 * 1000) {
        attention.push('no_recent_attendance');
      }
      const expiring = expiringMembershipMap.get(m.user._id.toString());
      if (expiring) attention.push('membership_expiring');
      return { ...m.toObject(), lastVisit, attention };
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
