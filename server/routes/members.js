const express = require('express');
const router = express.Router();
const User = require('../models/User');
const MemberProfile = require('../models/MemberProfile');
const TrainerProfile = require('../models/TrainerProfile');
const Notification = require('../models/Notification');
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

const PHONE_RE = /^[\+]?[\d\s\-\(\)]{7,15}$/;

const validatePhoneNumbers = (phoneNumbers) => {
  if (phoneNumbers === undefined) return null;
  if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
    return 'At least one phone number is required';
  }
  const seen = new Set();
  for (const entry of phoneNumbers) {
    const number = String(entry && entry.number || '').trim();
    if (!number) return 'Phone number is required';
    if (!PHONE_RE.test(number)) return 'Please provide a valid phone number';
    if (seen.has(number)) return 'Duplicate phone numbers are not allowed';
    seen.add(number);
  }
  return null;
};

// Pull the extended member-profile fields off the request body so the member
// profile (phones, body data, health info) is stored exactly once and central.
const pickProfileFields = (body) => {
  const fields = {};
  for (const key of ['phone', 'phoneNumbers', 'gender', 'dateOfBirth', 'address',
    'emergencyContact', 'heightCm', 'weightKg', 'goals', 'medicalConditions',
    'medicalNotes', 'allergies', 'medicalRestrictions', 'doctorRecommendation']) {
    if (body[key] !== undefined) fields[key] = body[key];
  }
  return fields;
};

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
      .select('name email role isActive avatar createdAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const memberIds = members.map((m) => m._id);
    const [profiles, activeMemberships] = await Promise.all([
      memberIds.length > 0
        ? MemberProfile.find({ user: { $in: memberIds } }).populate('assignedTrainer', 'name').lean()
        : [],
      memberIds.length > 0
        ? Membership.find({ user: { $in: memberIds }, status: 'ACTIVE' })
            .populate('plan', 'name')
            .sort({ endDate: -1 })
            .lean()
        : []
    ]);
    const profileMap = new Map(profiles.map((p) => [p.user.toString(), p]));

    const membershipMap = new Map();
    for (const m of activeMemberships) {
      const key = m.user.toString();
      if (!membershipMap.has(key)) membershipMap.set(key, m);
    }

    const membersWithProfiles = members.map((m) => {
      const profile = profileMap.get(m._id.toString()) || null;
      const membership = membershipMap.get(m._id.toString()) || null;
      return { ...m, profile, membership };
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
      .sort({ createdAt: -1 })
      .lean();
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
      Membership.find({ user: member._id }).populate('plan', 'name price duration').sort({ endDate: -1 }).limit(5).lean(),
      Attendance.find({ user: member._id }).select('date checkInTime checkOutTime duration').sort({ date: -1 }).limit(30).lean(),
      Payment.find({ user: member._id })
        .select('amount method status date membership')
        .populate({ path: 'membership', populate: { path: 'plan', select: 'name' } })
        .sort({ date: -1 })
        .limit(10)
        .lean(),
      WorkoutPlan.find({ member: member._id, isActive: true })
        .populate('trainer', 'name')
        .populate('exercises.exercise', 'name category muscleGroup')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      WorkoutLog.find({ user: member._id })
        .populate('exercise', 'name category muscleGroup')
        .sort({ date: -1 })
        .limit(20)
        .lean(),
      FitnessGoal.find({ user: member._id }).sort({ createdAt: -1 }).limit(10).lean(),
      BodyMeasurement.find({ user: member._id }).sort({ date: -1 }).limit(10).lean(),
      // Thresholds mirror server/utils/cron.js (7-day low-attendance) and the admin
      // dashboard (30-day expiring-soon window). Single query per member view.
      (async () => {
        const now = new Date();
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + 30);
        return Membership.findOne({ user: member._id, status: 'ACTIVE', endDate: { $gte: now, $lte: cutoff } })
          .populate('plan', 'name')
          .select('user status endDate plan')
          .lean();
      })(),
      (async () => {
        const last = await Attendance.findOne({ user: member._id }).sort({ checkInTime: -1 }).select('checkInTime').lean();
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

    const phoneError = validatePhoneNumbers(req.body.phoneNumbers);
    if (phoneError) return res.status(400).json({ message: phoneError });

    const { name, email, password, joinDate } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already exists' });

    const user = await User.create({ name, email, password, role: 'member' });
    await MemberProfile.create({
      user: user._id,
      ...pickProfileFields(req.body),
      joinDate: joinDate ? new Date(joinDate) : new Date(),
      trainerAssignmentStatus: 'NONE'
    });

    res.status(201).json({ member: user });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    if (req.body.assignedTrainer !== undefined) {
      // Trainer allocation must go through assign-trainer or the allocation
      // service so the assignment status stays coherent.
      delete req.body.assignedTrainer;
    }

    const phoneError = validatePhoneNumbers(req.body.phoneNumbers);
    if (phoneError) return res.status(400).json({ message: phoneError });

    const { name, email } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'Member not found' });

    const profileFields = pickProfileFields(req.body);
    if (Object.keys(profileFields).length > 0) {
      await MemberProfile.findOneAndUpdate(
        { user: req.params.id },
        profileFields,
        { new: true }
      );
    }

    res.json({ member: user });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:id/assign-trainer', auth, authorize('admin'), async (req, res) => {
  try {
    const { trainerId } = req.body;
    const member = await User.findById(req.params.id);
    if (!member || member.role !== 'member') {
      return res.status(404).json({ message: 'Member not found' });
    }

    const profile = await MemberProfile.findOne({ user: member._id });
    if (!profile) return res.status(404).json({ message: 'Member profile not found' });

    const clearing = trainerId === null || trainerId === undefined || String(trainerId).trim() === '';
    if (clearing) {
      profile.assignedTrainer = undefined;
      profile.trainerAssignmentStatus = 'NONE';
      profile.pendingTrainerReason = undefined;
      profile.assignedAt = undefined;
      await profile.save();
      return res.json({ profile });
    }

    const trainer = await User.findOne({ _id: trainerId, role: 'trainer', isActive: true });
    if (!trainer) {
      return res.status(400).json({ message: 'Trainer must be an active trainer account' });
    }

    // Capacity check - an admin override may not exceed the trainer's stated
    // member limit (an existing assignment to the same trainer is an update).
    if (profile.assignedTrainer && String(profile.assignedTrainer) === String(trainer._id)) {
      profile.trainerAssignmentStatus = 'ASSIGNED';
      profile.pendingTrainerReason = undefined;
      profile.assignedAt = new Date();
      await profile.save();
      return res.json({ profile });
    }
    const trainerProfile = await TrainerProfile.findOne({ user: trainer._id });
    const max = trainerProfile && trainerProfile.maxMembers > 0 ? trainerProfile.maxMembers : Infinity;
    const currentLoad = await MemberProfile.countDocuments({ assignedTrainer: trainer._id });
    if (currentLoad >= max) {
      return res.status(400).json({ message: `${trainer.name} is already at their member limit (${max})` });
    }

    profile.assignedTrainer = trainer._id;
    profile.trainerAssignmentStatus = 'ASSIGNED';
    profile.pendingTrainerReason = undefined;
    profile.assignedAt = new Date();
    await profile.save();

    await Promise.all([
      Notification.create({
        user: member._id,
        title: 'Trainer assigned',
        message: `Your trainer is ${trainer.name}.`,
        type: 'trainer_assignment'
      }),
      Notification.create({
        user: trainer._id,
        title: 'New member assigned',
        message: `You have been assigned as the trainer for ${member.name}.`,
        type: 'trainer_assignment'
      })
    ]);

    res.json({ profile });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/trainer/:trainerId', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const profiles = await MemberProfile.find({ assignedTrainer: req.params.trainerId }).populate('user', 'name email isActive').lean();
    res.json({ members: profiles });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
