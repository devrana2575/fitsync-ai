const express = require('express');
const router = express.Router();
const BodyMeasurement = require('../models/BodyMeasurement');
const { auth, authorize } = require('../middleware/auth');

router.get('/my', auth, async (req, res) => {
  try {
    const measurements = await BodyMeasurement.find({ user: req.user._id }).sort({ date: -1 });
    res.json({ measurements });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/member/:userId', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const measurements = await BodyMeasurement.find({ user: req.params.userId }).sort({ date: -1 });
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
    res.status(201).json({ measurement });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/latest', auth, async (req, res) => {
  try {
    const measurement = await BodyMeasurement.findOne({ user: req.user._id }).sort({ date: -1 });
    res.json({ measurement });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
