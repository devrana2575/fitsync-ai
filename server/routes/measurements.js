const express = require('express');
const router = express.Router();
const BodyMeasurement = require('../models/BodyMeasurement');
const MemberProfile = require('../models/MemberProfile');
const { auth, authorize } = require('../middleware/auth');
const { canTrainerAccessMember } = require('../utils/access');

router.get('/my', auth, async (req, res) => {
  try {
    const measurements = await BodyMeasurement.find({ user: req.user._id }).sort({ date: -1 }).limit(365).lean();
    res.json({ measurements });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/member/:userId', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    // Trainers may only read measurements of members they coach.
    if (req.user.role === 'trainer') {
      const entitled = await canTrainerAccessMember(req.user._id, req.params.userId);
      if (!entitled) return res.status(403).json({ message: 'Access denied' });
    }
    const measurements = await BodyMeasurement.find({ user: req.params.userId }).sort({ date: -1 }).limit(365).lean();
    res.json({ measurements });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { weight, height, bodyFat, chest, waist, hips, biceps, thighs, date } = req.body;
    const measurement = await BodyMeasurement.create({
      user: req.user._id,
      weight,
      height,
      bodyFat,
      chest,
      waist,
      hips,
      biceps,
      thighs,
      date: date || new Date()
    });

    // Keep the member profile's current body data in sync with the recorded
    // measurement so profile completion and the measurement history share the
    // same source of truth (no second, drifting copy of weight/height).
    const profileSet = {};
    if (weight !== undefined) profileSet.weightKg = weight;
    if (height !== undefined) profileSet.heightCm = height;
    if (Object.keys(profileSet).length > 0) {
      await MemberProfile.updateOne({ user: req.user._id }, { $set: profileSet });
    }

    res.status(201).json({ measurement });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/latest', auth, async (req, res) => {
  try {
    const measurement = await BodyMeasurement.findOne({ user: req.user._id }).sort({ date: -1 }).lean();
    res.json({ measurement });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
