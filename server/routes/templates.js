const express = require('express');
const router = express.Router();
const WorkoutTemplate = require('../models/WorkoutTemplate');
const WorkoutPlan = require('../models/WorkoutPlan');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const { escapeRegex, parsePagination } = require('../utils/helpers');
const { canTrainerAccessMember } = require('../utils/access');

router.get('/', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const { goal, difficulty, search } = req.query;
    const filter = { isActive: true };
    if (goal) filter.goal = goal;
    if (difficulty) filter.difficulty = difficulty;
    if (search) filter.name = { $regex: escapeRegex(search), $options: 'i' };
    if (req.user.role === 'trainer') filter.$or = [{ createdBy: req.user._id }, { isShared: true }];
    const templates = await WorkoutTemplate.find(filter)
      .populate('createdBy', 'name')
      .populate('exercises.exercise', 'name muscleGroup')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ templates });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const template = await WorkoutTemplate.findById(req.params.id)
      .populate('createdBy', 'name')
      .populate('exercises.exercise', 'name muscleGroup category difficulty')
      .lean();
    if (!template) return res.status(404).json({ message: 'Template not found' });
    // A private template is visible only to its author (admins see all).
    if (req.user.role === 'trainer' && !template.isShared && String(template.createdBy?._id || template.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    res.json({ template });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const { name, description, goal, difficulty, exercises, dayOfWeek } = req.body;
    if (!name) return res.status(400).json({ message: 'Template name is required' });
    const template = await WorkoutTemplate.create({
      name,
      description,
      createdBy: req.user._id,
      goal: goal || 'general_fitness',
      difficulty: difficulty || 'intermediate',
      exercises: exercises || [],
      dayOfWeek: dayOfWeek || [],
      isShared: req.user.role === 'admin'
    });
    res.status(201).json({ template });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const template = await WorkoutTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ message: 'Template not found' });
    if (req.user.role === 'trainer' && String(template.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only edit your own templates' });
    }
    const allowed = ['name', 'description', 'goal', 'difficulty', 'exercises', 'dayOfWeek', 'isActive'];
    const update = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const updated = await WorkoutTemplate.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json({ template: updated });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const template = await WorkoutTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ message: 'Template not found' });
    if (req.user.role === 'trainer' && String(template.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only delete your own templates' });
    }
    template.isActive = false;
    await template.save();
    res.json({ message: 'Template deactivated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/:id/assign', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const { memberId } = req.body;
    if (!memberId) return res.status(400).json({ message: 'Member is required' });

    const template = await WorkoutTemplate.findById(req.params.id);
    if (!template || !template.isActive) return res.status(404).json({ message: 'Template not found' });

    // A trainer can only use templates they own or that are shared, and can
    // only build plans for members they are entitled to coach.
    if (req.user.role === 'trainer') {
      const mayUse = template.isShared || String(template.createdBy?._id || template.createdBy) === String(req.user._id);
      if (!mayUse) return res.status(403).json({ message: 'Access denied' });
      const entitled = await canTrainerAccessMember(req.user._id, memberId);
      if (!entitled) return res.status(403).json({ message: 'You can only create plans for members assigned to you' });
    }

    const member = await User.findOne({ _id: memberId, role: 'member', isActive: true });
    if (!member) return res.status(400).json({ message: 'Member not found or inactive' });

    const existingActive = await WorkoutPlan.findOne({ member: memberId, isActive: true, name: template.name });
    if (existingActive) {
      return res.status(400).json({ message: 'This member already has an active plan with the same name' });
    }

    const plan = await WorkoutPlan.create({
      trainer: req.user._id,
      member: memberId,
      name: template.name,
      description: template.description,
      exercises: template.exercises.map((e) => ({
        exercise: e.exercise,
        sets: e.sets,
        reps: e.reps,
        weight: e.weight,
        duration: e.duration,
        restTime: e.restTime,
        notes: e.notes
      })),
      dayOfWeek: template.dayOfWeek,
      isActive: true
    });

    template.timesAssigned += 1;
    await template.save();

    const populated = await WorkoutPlan.findById(plan._id).populate('member', 'name email').lean();
    res.status(201).json({ plan: populated });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;