const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const MemberProfile = require('../models/MemberProfile');
const TrainerProfile = require('../models/TrainerProfile');
const { generateToken } = require('../utils/helpers');
const { auth } = require('../middleware/auth');

router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['member', 'trainer']).withMessage('Invalid role. Accounts are created by an administrator.')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { name, email, password, role, phone, specializations } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const user = await User.create({ name, email, password, role });

    if (role === 'member') {
      await MemberProfile.create({ user: user._id, phone });
    } else if (role === 'trainer') {
      await TrainerProfile.create({
        user: user._id,
        phone,
        specializations: specializations || []
      });
    }

    const token = generateToken(user._id);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated. Contact admin.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    let profile = null;

    if (user.role === 'member') {
      profile = await MemberProfile.findOne({ user: user._id }).populate('assignedTrainer', 'name email');
    } else if (user.role === 'trainer') {
      profile = await TrainerProfile.findOne({ user: user._id });
    }

    res.json({ user, profile });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/me', auth, async (req, res) => {
  try {
    const { name, phone, address, emergencyContact, specializations, bio } = req.body;
    const user = await User.findByIdAndUpdate(req.user._id, { name }, { new: true });

    if (user.role === 'member') {
      await MemberProfile.findOneAndUpdate(
        { user: user._id },
        { phone, address, emergencyContact },
        { new: true }
      );
    } else if (user.role === 'trainer') {
      await TrainerProfile.findOneAndUpdate(
        { user: user._id },
        { phone, specializations, bio },
        { new: true }
      );
    }

    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
