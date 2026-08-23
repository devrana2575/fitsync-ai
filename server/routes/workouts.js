const express = require('express');
const router = express.Router();
const WorkoutPlan = require('../models/WorkoutPlan');
const { auth, authorize } = require('../middleware/auth');

router.get('/', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const { page = 1, limit = 20, memberId } = req.query;
    const filter = {};
    if (req.user.role === 'trainer') filter.trainer = req.user._id;
    if (memberId) filter.member = memberId;

    const total = await WorkoutPlan.countDocuments(filter);
    const plans = await WorkoutPlan.find(filter)
      .populate('trainer', 'name email')
      .populate('member', 'name email')
      .populate('exercises.exercise')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.json({ plans, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/my', auth, async (req, res) => {
  try {
    const plans = await WorkoutPlan.find({ member: req.user._id, isActive: true })
      .populate('trainer', 'name')
      .populate('exercises.exercise')
      .sort({ createdAt: -1 });
    res.json({ plans });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const plan = await WorkoutPlan.findById(req.params.id)
      .populate('trainer', 'name email')
      .populate('member', 'name email')
      .populate('exercises.exercise');
    if (!plan) return res.status(404).json({ message: 'Workout plan not found' });
    res.json({ plan });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const { member, name, goal, duration, description, exercises, startDate, endDate, dayOfWeek } = req.body;

    if (!goal || !String(goal).trim()) {
      return res.status(400).json({ message: 'Plan goal is required' });
    }
    if (!duration || !String(duration).trim()) {
      return res.status(400).json({ message: 'Plan duration is required' });
    }

    const plan = await WorkoutPlan.create({
      trainer: req.user._id,
      member,
      name,
      goal: String(goal).trim(),
      duration: String(duration).trim(),
      description,
      exercises: exercises || [],
      startDate: startDate || new Date(),
      endDate,
      dayOfWeek: dayOfWeek || []
    });
    res.status(201).json({ plan });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const plan = await WorkoutPlan.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate('exercises.exercise');
    if (!plan) return res.status(404).json({ message: 'Workout plan not found' });
    res.json({ plan });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/:id', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const plan = await WorkoutPlan.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!plan) return res.status(404).json({ message: 'Workout plan not found' });
    res.json({ message: 'Workout plan deactivated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
