const express = require('express');
const router = express.Router();
const User = require('../models/User');
const MemberProfile = require('../models/MemberProfile');
const Membership = require('../models/Membership');
const Attendance = require('../models/Attendance');
const { auth, authorize } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

router.get('/', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const filter = { role: 'member' };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    if (status === 'active') filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;

    const total = await User.countDocuments(filter);
    const members = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const membersWithProfiles = await Promise.all(
      members.map(async (m) => {
        const profile = await MemberProfile.findOne({ user: m._id }).populate('assignedTrainer', 'name');
        return { ...m.toObject(), profile };
      })
    );

    res.json({
      members: membersWithProfiles,
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
    const member = await User.findById(req.params.id);
    if (!member || member.role !== 'member') {
      return res.status(404).json({ message: 'Member not found' });
    }
    const profile = await MemberProfile.findOne({ user: member._id }).populate('assignedTrainer', 'name email');
    const membership = await Membership.findOne({ user: member._id, status: 'ACTIVE' }).populate('plan');
    const attendance = await Attendance.find({ user: member._id }).sort({ date: -1 }).limit(30);

    res.json({ member, profile, membership, attendance });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/', auth, authorize('admin'), [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('phone').trim().notEmpty().withMessage('Phone is required'),
  body('dateOfBirth').notEmpty().withMessage('Date of birth is required'),
  body('address').trim().notEmpty().withMessage('Address is required')
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
    res.status(500).json({ message: 'Server error', error: error.message });
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
    res.status(500).json({ message: 'Server error', error: error.message });
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/trainer/:trainerId', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const profiles = await MemberProfile.find({ assignedTrainer: req.params.trainerId }).populate('user', 'name email isActive');
    res.json({ members: profiles });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
