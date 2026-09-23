const express = require('express');
const router = express.Router();
const User = require('../models/User');
const TrainerProfile = require('../models/TrainerProfile');
const MemberProfile = require('../models/MemberProfile');
const Notification = require('../models/Notification');
const { auth, authorize } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { escapeRegex, parsePagination } = require('../utils/helpers');
const { sanitizeMemberProfileForViewer } = require('../utils/access');

// When a trainer goes unavailable the members assigned to them and the admins
// must know. Notifications are informational - the assignment is preserved and
// training resumes when the trainer returns.
const notifyAbsence = async (trainer, trainerProfile, reason) => {
  const members = await MemberProfile.find({ assignedTrainer: trainer._id }).select('user').lean();
  const notifications = [];
  for (const m of members) {
    notifications.push({
      user: m.user,
      title: 'Trainer unavailable',
      message: `Your trainer ${trainer.name} is currently unavailable${reason ? ` (${reason})` : ''}.`,
      type: 'trainer_absent'
    });
  }
  const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
  for (const a of admins) {
    notifications.push({
      user: a._id,
      title: 'Trainer unavailable',
      message: `${trainer.name} (${trainer.email}) is marked unavailable${reason ? `: ${reason}` : ''}.`,
      type: 'trainer_absent'
    });
  }
  if (notifications.length > 0) await Notification.insertMany(notifications);
  return trainerProfile;
};

router.get('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query.page, req.query.limit, 1, 20, 100);
    const { search } = req.query;
    const filter = { role: 'trainer' };
    if (search) {
      const escaped = escapeRegex(search);
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } }
      ];
    }

    const total = await User.countDocuments(filter);
    const trainers = await User.find(filter)
      .select('name email role isActive avatar createdAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const trainerIds = trainers.map((t) => t._id);

    const [profiles, counts] = await Promise.all([
      trainerIds.length > 0
        ? TrainerProfile.find({ user: { $in: trainerIds } }).lean()
        : [],
      trainerIds.length > 0
        ? MemberProfile.aggregate([
            { $match: { assignedTrainer: { $in: trainerIds } } },
            { $group: { _id: '$assignedTrainer', count: { $sum: 1 } } }
          ])
        : []
    ]);
    const profileMap = new Map(profiles.map((p) => [p.user.toString(), p]));
    const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

    const trainersWithProfiles = trainers.map((t) => {
      const profile = profileMap.get(t._id.toString()) || null;
      const memberCount = countMap.get(t._id.toString()) || 0;
      return { ...t, profile, memberCount };
    });

    res.json({
      trainers: trainersWithProfiles,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Public-to-authenticated lightweight trainer picker (name + email only, no
// roster, no availability internals). Declared BEFORE /:id so `/list/all` is
// not swallowed by the id pattern.
router.get('/list/all', auth, async (req, res) => {
  try {
    const trainers = await User.find({ role: 'trainer', isActive: true }).select('name email').lean();
    res.json({ trainers });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const trainer = await User.findById(req.params.id);
    if (!trainer || trainer.role !== 'trainer') {
      return res.status(404).json({ message: 'Trainer not found' });
    }

    // Trainers see their own profile only, and only their own roster. A
    // trainer must never use this endpoint to read another trainer's members.
    if (req.user.role === 'trainer' && String(trainer._id) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const idFilter = { assignedTrainer: trainer._id };
    const [profile, members] = await Promise.all([
      TrainerProfile.findOne({ user: trainer._id }).lean(),
      MemberProfile.find(idFilter).populate('user', 'name email isActive').lean()
    ]);
    // Roster context: medical fields are never included on a trainer list,
    // even for the trainer's own members (detail view is where they belong).
    for (let i = 0; i < members.length; i += 1) {
      members[i] = sanitizeMemberProfileForViewer(members[i], req.user.role);
    }
    res.json({ trainer, profile, members });
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

    const { name, email, password, phone, specializations, experience, bio, certifications } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already exists' });

    const user = await User.create({ name, email, password, role: 'trainer' });
    try {
      await TrainerProfile.create({
        user: user._id,
        phone,
        specializations: specializations || [],
        experience: experience || 0,
        bio,
        certifications: certifications || []
      });
    } catch (profileError) {
      // Never leave a User without its trainer profile (orphaned record).
      await User.deleteOne({ _id: user._id });
      throw profileError;
    }

    res.status(201).json({ trainer: user });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { name, email, phone, dateOfBirth, gender, address, heightCm, weightKg, specializations, experience, bio, certifications, languages, workingDays, workingHours, maxMembers, isAvailable, absenceReason, absenceFrom, absenceTo } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'Trainer not found' });

    const update = {
      phone, dateOfBirth, gender, address, heightCm, weightKg,
      specializations, experience, bio, certifications, languages,
      workingDays, workingHours, maxMembers
    };
    if (isAvailable !== undefined) update.isAvailable = isAvailable === true;
    if (absenceReason !== undefined) update.absenceReason = absenceReason;
    if (absenceFrom !== undefined) update.absenceFrom = absenceFrom ? new Date(absenceFrom) : undefined;
    if (absenceTo !== undefined) update.absenceTo = absenceTo ? new Date(absenceTo) : undefined;
    for (const key of Object.keys(update)) {
      if (update[key] === undefined) delete update[key];
    }

    const profile = await TrainerProfile.findOneAndUpdate(
      { user: req.params.id },
      update,
      { new: true }
    );

    if (update.isAvailable === false) {
      await notifyAbsence(user, profile, update.absenceReason || profile.absenceReason);
    }

    res.json({ trainer: user, profile });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Trainers mark their own availability (planning their absence). Declared
// before /:id/availability so /me is never treated as a trainer id.
router.put('/me/availability', auth, authorize('trainer'), async (req, res) => {
  try {
    const { isAvailable, reason, from, to } = req.body;
    if (typeof isAvailable !== 'boolean') {
      return res.status(400).json({ message: 'isAvailable must be a boolean' });
    }

    const user = await User.findById(req.user._id);
    const profile = await TrainerProfile.findOneAndUpdate(
      { user: user._id },
      {
        isAvailable: isAvailable === true,
        absenceReason: isAvailable === false ? (reason || 'Unavailable') : undefined,
        absenceFrom: isAvailable === false && from ? new Date(from) : undefined,
        absenceTo: isAvailable === false && to ? new Date(to) : undefined
      },
      { new: true }
    );

    if (isAvailable === false) {
      await notifyAbsence(user, profile, reason || profile.absenceReason);
    }

    res.json({ profile });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin marks a trainer unavailable (leave / absence) or available again.
router.put('/:id/availability', auth, authorize('admin'), async (req, res) => {
  try {
    const { isAvailable, reason, from, to } = req.body;
    if (typeof isAvailable !== 'boolean') {
      return res.status(400).json({ message: 'isAvailable must be a boolean' });
    }

    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'trainer') {
      return res.status(404).json({ message: 'Trainer not found' });
    }

    const profile = await TrainerProfile.findOneAndUpdate(
      { user: user._id },
      {
        isAvailable: isAvailable === true,
        absenceReason: isAvailable === false ? (reason || 'Unavailable') : undefined,
        absenceFrom: isAvailable === false && from ? new Date(from) : undefined,
        absenceTo: isAvailable === false && to ? new Date(to) : undefined
      },
      { new: true }
    );

    if (isAvailable === false) {
      await notifyAbsence(user, profile, reason || profile.absenceReason);
    }

    res.json({ trainer: user, profile });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
