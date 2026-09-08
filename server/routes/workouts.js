const express = require('express');
const router = express.Router();
const WorkoutPlan = require('../models/WorkoutPlan');
const { auth, authorize } = require('../middleware/auth');
const { parsePagination } = require('../utils/helpers');

router.get('/', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query.page, req.query.limit, 1, 20, 100);
    const { memberId } = req.query;
    const filter = {};
    if (req.user.role === 'trainer') filter.trainer = req.user._id;
    if (memberId) filter.member = memberId;

    const total = await WorkoutPlan.countDocuments(filter);
    const plans = await WorkoutPlan.find(filter)
      .populate('trainer', 'name email')
      .populate('member', 'name email')
      .populate('exercises.exercise')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({ plans, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
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
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const plan = await WorkoutPlan.findById(req.params.id)
      .populate('trainer', 'name email')
      .populate('member', 'name email')
      .populate('exercises.exercise');
    if (!plan) return res.status(404).json({ message: 'Workout plan not found' });

    const isAdmin = req.user.role === 'admin';
    const isTrainerAssigned = req.user.role === 'trainer' && plan.trainer && plan.trainer._id.toString() === req.user._id.toString();
    const isOwner = req.user.role === 'member' && plan.member && plan.member._id.toString() === req.user._id.toString();

    if (!isAdmin && !isTrainerAssigned && !isOwner) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ plan });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const { member, name, description, exercises, startDate, endDate, dayOfWeek } = req.body;
    const plan = await WorkoutPlan.create({
      trainer: req.user._id,
      member,
      name,
      description,
      exercises: exercises || [],
      startDate: startDate || new Date(),
      endDate,
      dayOfWeek: dayOfWeek || []
    });
    res.status(201).json({ plan });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const { name, description, exercises, startDate, endDate, dayOfWeek, isActive } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (exercises !== undefined) update.exercises = exercises;
    if (startDate !== undefined) update.startDate = startDate;
    if (endDate !== undefined) update.endDate = endDate;
    if (dayOfWeek !== undefined) update.dayOfWeek = dayOfWeek;
    if (isActive !== undefined) update.isActive = isActive;

    const plan = await WorkoutPlan.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('exercises.exercise');
    if (!plan) return res.status(404).json({ message: 'Workout plan not found' });
    res.json({ plan });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const plan = await WorkoutPlan.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!plan) return res.status(404).json({ message: 'Workout plan not found' });
    res.json({ message: 'Workout plan deactivated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
