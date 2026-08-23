const express = require('express');
const router = express.Router();
const User = require('../models/User');
const TrainerProfile = require('../models/TrainerProfile');
const MemberProfile = require('../models/MemberProfile');
const { auth, authorize } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

router.get('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const filter = { role: 'trainer' };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await User.countDocuments(filter);
    const trainers = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const trainersWithProfiles = await Promise.all(
      trainers.map(async (t) => {
        const profile = await TrainerProfile.findOne({ user: t._id });
        const memberCount = await MemberProfile.countDocuments({ assignedTrainer: t._id });
        return { ...t.toObject(), profile, memberCount };
      })
    );

    res.json({
      trainers: trainersWithProfiles,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const trainer = await User.findById(req.params.id);
    if (!trainer || trainer.role !== 'trainer') {
      return res.status(404).json({ message: 'Trainer not found' });
    }
    const profile = await TrainerProfile.findOne({ user: trainer._id });
    const members = await MemberProfile.find({ assignedTrainer: trainer._id }).populate('user', 'name email isActive');
    res.json({ trainer, profile, members });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/', auth, authorize('admin'), [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('specializations')
    .custom((value) => Array.isArray(value) || typeof value === 'string')
    .withMessage('Specializations must be a list'),
  body('specializations')
    .custom((value) => (Array.isArray(value) ? value.length > 0 : String(value).trim().length > 0))
    .withMessage('At least one specialization is required'),
  body('experience')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('Experience must be a number greater than or equal to 0')
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
    res.status(500).json({ message: 'Server error', error: error.message });
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/list/all', auth, async (req, res) => {
  try {
    const trainers = await User.find({ role: 'trainer', isActive: true }).select('name email');
    res.json({ trainers });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
