const express = require('express');
const router = express.Router();
const BodyMeasurement = require('../models/BodyMeasurement');
const { auth } = require('../middleware/auth');

const canViewMemberData = (req) =>
  req.user.role === 'admin' || req.user.role === 'trainer' || req.params.userId === String(req.user._id);

router.get('/my', auth, async (req, res) => {
  try {
    const measurements = await BodyMeasurement.find({ user: req.user._id }).sort({ date: -1 });
    res.json({ measurements });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/member/:userId', auth, async (req, res) => {
  try {
    if (!canViewMemberData(req)) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }
    const measurements = await BodyMeasurement.find({ user: req.params.userId }).sort({ date: -1 });
    res.json({ measurements });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { weight, height, bodyFat, chest, waist, hips, biceps, thighs, date, userId, notes } = req.body;

    // Data dictionary: Progress.weight and Progress.height are required and > 0.
    if (!weight || Number(weight) <= 0) {
      return res.status(400).json({ message: 'Weight is required and must be greater than zero' });
    }
    if (!height || Number(height) <= 0) {
      return res.status(400).json({ message: 'Height is required and must be greater than zero' });
    }

    // Per design 3.2.6, trainers/admins record a member's progress; members record their own.
    let targetUserId = req.user._id;
    if (userId && userId !== String(req.user._id)) {
      if (req.user.role !== 'admin' && req.user.role !== 'trainer') {
        return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
      }
      targetUserId = userId;
    }

    const measurement = await BodyMeasurement.create({
      user: targetUserId,
      weight,
      height,
      bodyFat,
      chest,
      waist,
      hips,
      biceps,
      thighs,
      notes,
      date: date || new Date()
    });
    res.status(201).json({ measurement });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/latest', auth, async (req, res) => {
  try {
    const measurement = await BodyMeasurement.findOne({ user: req.user._id }).sort({ date: -1 });
    res.json({ measurement });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
