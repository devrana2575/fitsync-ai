const express = require('express');
const router = express.Router();
const User = require('../models/User');
const TrainerProfile = require('../models/TrainerProfile');
const MemberProfile = require('../models/MemberProfile');
const { auth, authorize } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { escapeRegex, parsePagination } = require('../utils/helpers');

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
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const trainerIds = trainers.map((t) => t._id);

    const profiles = trainerIds.length > 0
      ? await TrainerProfile.find({ user: { $in: trainerIds } })
      : [];
    const profileMap = new Map(profiles.map((p) => [p.user.toString(), p]));

    const counts = trainerIds.length > 0
      ? await MemberProfile.aggregate([
          { $match: { assignedTrainer: { $in: trainerIds } } },
          { $group: { _id: '$assignedTrainer', count: { $sum: 1 } } }
        ])
      : [];
    const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

    const trainersWithProfiles = trainers.map((t) => {
      const profile = profileMap.get(t._id.toString()) || null;
      const memberCount = countMap.get(t._id.toString()) || 0;
      return { ...t.toObject(), profile, memberCount };
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

router.get('/:id', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const trainer = await User.findById(req.params.id);
    if (!trainer || trainer.role !== 'trainer') {
      return res.status(404).json({ message: 'Trainer not found' });
    }
    const profile = await TrainerProfile.findOne({ user: trainer._id });
    const members = await MemberProfile.find({ assignedTrainer: trainer._id }).populate('user', 'name email isActive');
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
    await TrainerProfile.create({
      user: user._id,
      phone,
      specializations: specializations || [],
      experience: experience || 0,
      bio,
      certifications: certifications || []
    });

    res.status(201).json({ trainer: user });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { name, email, phone, specializations, experience, bio, certifications, maxMembers } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'Trainer not found' });

    await TrainerProfile.findOneAndUpdate(
      { user: req.params.id },
      { phone, specializations, experience, bio, certifications, maxMembers },
      { new: true }
    );

    res.json({ trainer: user });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/list/all', auth, async (req, res) => {
  try {
    const trainers = await User.find({ role: 'trainer', isActive: true }).select('name email');
    res.json({ trainers });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
