const express = require('express');
const router = express.Router();
const User = require('../models/User');
const MemberProfile = require('../models/MemberProfile');
const Membership = require('../models/Membership');
const Attendance = require('../models/Attendance');
const Payment = require('../models/Payment');
const WorkoutPlan = require('../models/WorkoutPlan');
const WorkoutLog = require('../models/WorkoutLog');
const FitnessGoal = require('../models/FitnessGoal');
const BodyMeasurement = require('../models/BodyMeasurement');
const { auth, authorize } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { escapeRegex, parsePagination } = require('../utils/helpers');

router.get('/', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query.page, req.query.limit, 1, 20, 100);
    const { search, status } = req.query;
    const filter = { role: 'member' };
    if (search) {
      const escaped = escapeRegex(search);
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } }
      ];
    }
    if (status === 'active') filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;

    const total = await User.countDocuments(filter);
    const members = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const memberIds = members.map((m) => m._id);
    const profiles = memberIds.length > 0
      ? await MemberProfile.find({ user: { $in: memberIds } }).populate('assignedTrainer', 'name')
      : [];
    const profileMap = new Map(profiles.map((p) => [p.user.toString(), p]));

    const activeMemberships = memberIds.length > 0
      ? await Membership.find({ user: { $in: memberIds }, status: 'ACTIVE' })
          .populate('plan', 'name')
          .sort({ endDate: -1 })
      : [];
    const membershipMap = new Map();
    for (const m of activeMemberships) {
      const key = m.user.toString();
      if (!membershipMap.has(key)) membershipMap.set(key, m);
    }

    const membersWithProfiles = members.map((m) => {
      const profile = profileMap.get(m._id.toString()) || null;
      const membership = membershipMap.get(m._id.toString()) || null;
      return { ...m.toObject(), profile, membership };
    });

    res.json({
      members: membersWithProfiles,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/by-trainer', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const filter = req.user.role === 'trainer' ? { assignedTrainer: req.user._id } : {};
    const profiles = await MemberProfile.find(filter)
      .populate('user', 'name email isActive')
      .sort({ createdAt: -1 });
    res.json({ members: profiles });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const member = await User.findById(req.params.id);
    if (!member || member.role !== 'member') {
      return res.status(404).json({ message: 'Member not found' });
    }

    const profile = await MemberProfile.findOne({ user: member._id }).populate('assignedTrainer', 'name email');

    // A trainer may only view members assigned to them.
    if (req.user.role === 'trainer' && (!profile || !profile.assignedTrainer || profile.assignedTrainer._id.toString() !== req.user._id.toString())) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const [memberships, attendance, payments, workoutPlans, workoutLogs, goals, measurements, expiringMembership, lastVisit] = await Promise.all([
      Membership.find({ user: member._id }).populate('plan').sort({ endDate: -1 }).limit(5),
      Attendance.find({ user: member._id }).sort({ date: -1 }).limit(30),
      Payment.find({ user: member._id })
        .populate({ path: 'membership', populate: { path: 'plan', select: 'name' } })
        .sort({ date: -1 })
        .limit(10),
      WorkoutPlan.find({ member: member._id, isActive: true })
        .populate('trainer', 'name')
        .populate('exercises.exercise')
        .sort({ createdAt: -1 })
        .limit(10),
      WorkoutLog.find({ user: member._id })
        .populate('exercise', 'name category muscleGroup')
        .sort({ date: -1 })
        .limit(20),
      FitnessGoal.find({ user: member._id }).sort({ createdAt: -1 }).limit(10),
      BodyMeasurement.find({ user: member._id }).sort({ date: -1 }).limit(10),
      // Thresholds mirror server/utils/cron.js (7-day low-attendance) and the admin
      // dashboard (30-day expiring-soon window). Single query per member view.
      (async () => {
        const now = new Date();
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + 30);
        return Membership.findOne({ user: member._id, status: 'ACTIVE', endDate: { $gte: now, $lte: cutoff } })
          .populate('plan', 'name')
          .select('user status endDate plan');
      })(),
      (async () => {
        const last = await Attendance.findOne({ user: member._id }).sort({ checkInTime: -1 }).select('checkInTime');
        return last ? last.checkInTime : null;
      })()
    ]);

    const activeMembership = memberships.find((m) => m.status === 'ACTIVE') || null;

    const attention = [];
    if (!lastVisit || (Date.now() - new Date(lastVisit).getTime()) > 7 * 24 * 60 * 60 * 1000) {
      attention.push('no_recent_attendance');
    }
    if (expiringMembership) attention.push('membership_expiring');

    res.json({
      member,
      profile,
      membership: activeMembership,
      memberships,
      attendance,
      payments,
      workoutPlans,
      workoutLogs,
      goals,
      measurements,
      lastVisit,
      attention
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, authorize('admin'), [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[A-Za-z])(?=.*\d).+$/).withMessage('Password must contain both letters and numbers')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { name, email, password, phone, gender, dateOfBirth, address, emergencyContact } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already exists' });

    const user = await User.create({ name, email, password, role: 'member' });
    await MemberProfile.create({
      user: user._id,
      phone,
      gender,
      dateOfBirth,
      address,
      emergencyContact,
      joinDate: new Date()
    });

    res.status(201).json({ member: user });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { name, email, phone, gender, dateOfBirth, address, emergencyContact, assignedTrainer, medicalConditions } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'Member not found' });

    await MemberProfile.findOneAndUpdate(
      { user: req.params.id },
      { phone, gender, dateOfBirth, address, emergencyContact, assignedTrainer, medicalConditions },
      { new: true }
    );

    res.json({ member: user });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:id/assign-trainer', auth, authorize('admin'), async (req, res) => {
  try {
    const { trainerId } = req.body;
    const profile = await MemberProfile.findOneAndUpdate(
      { user: req.params.id },
      { assignedTrainer: trainerId },
      { new: true }
    );
    if (!profile) return res.status(404).json({ message: 'Member profile not found' });
    res.json({ profile });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/trainer/:trainerId', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const profiles = await MemberProfile.find({ assignedTrainer: req.params.trainerId }).populate('user', 'name email isActive');
    res.json({ members: profiles });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
