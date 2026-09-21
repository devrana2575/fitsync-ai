const express = require('express');
const router = express.Router();
const WorkoutPlan = require('../models/WorkoutPlan');
const MemberProfile = require('../models/MemberProfile');
const { auth, authorize } = require('../middleware/auth');
const { parsePagination } = require('../utils/helpers');

// Business rule: a trainer may create or manage workout plans only for members
// assigned to them (ASSIGNED/DEDICATED entitlement) or, when the member's plan
// uses SHARED trainer support, any roster trainer may author a plan. Admins are
// unrestricted. This keeps member-trainer linkage authoritative at the admin/
// allocation layer instead of trusting the plan payload.
const canManagePlanForMember = async (role, memberId, trainerId) => {
  if (role === 'admin') return true;
  if (role !== 'trainer' || !memberId) return false;
  const profile = await MemberProfile.findOne({ user: memberId }).lean();
  if (!profile) return false;
  if (profile.assignedTrainer && String(profile.assignedTrainer) === String(trainerId)) return true;
  // SHARED entitlement: the membership's plan opts into any-roster-trainer plans.
  const Membership = require('../models/Membership');
  const active = await Membership.findOne({ user: memberId, status: 'ACTIVE' })
    .populate('plan', 'trainerAllocationMode trainerIncluded')
    .lean();
  return Boolean(
    active?.plan &&
    active.plan.trainerIncluded &&
    active.plan.trainerAllocationMode === 'SHARED'
  );
};

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
      .populate('exercises.exercise', 'name category muscleGroup')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({ plans, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/my', auth, async (req, res) => {
  try {
    const plans = await WorkoutPlan.find({ member: req.user._id, isActive: true })
      .populate('trainer', 'name')
      .populate('exercises.exercise', 'name category muscleGroup')
      .sort({ createdAt: -1 })
      .lean();
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
      .populate('exercises.exercise', 'name category muscleGroup')
      .lean();
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
    const { member, name, description, exercises, startDate, endDate, dayOfWeek, goal, hoursPerDay, totalHours, recommendationSource } = req.body;
    if (!member) return res.status(400).json({ message: 'member is required' });

    const allowed = await canManagePlanForMember(req.user.role, member, req.user._id);
    if (!allowed) {
      return res.status(403).json({ message: 'You can only create workout plans for members assigned to you' });
    }

    const plan = await WorkoutPlan.create({
      trainer: req.user._id,
      member,
      name,
      description,
      exercises: exercises || [],
      startDate: startDate || new Date(),
      endDate,
      dayOfWeek: dayOfWeek || [],
      goal,
      hoursPerDay,
      totalHours,
      recommendationSource: recommendationSource || 'trainer'
    });
    res.status(201).json({ plan });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const existing = await WorkoutPlan.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Workout plan not found' });

    const allowed = await canManagePlanForMember(req.user.role, existing.member, req.user._id);
    if (!allowed) {
      return res.status(403).json({ message: 'You can only modify workout plans for members assigned to you' });
    }

    const { name, description, exercises, startDate, endDate, dayOfWeek, isActive, goal, hoursPerDay, totalHours, recommendationSource } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (exercises !== undefined) update.exercises = exercises;
    if (startDate !== undefined) update.startDate = startDate;
    if (endDate !== undefined) update.endDate = endDate;
    if (dayOfWeek !== undefined) update.dayOfWeek = dayOfWeek;
    if (isActive !== undefined) update.isActive = isActive;
    if (goal !== undefined) update.goal = goal;
    if (hoursPerDay !== undefined) update.hoursPerDay = hoursPerDay;
    if (totalHours !== undefined) update.totalHours = totalHours;
    if (recommendationSource !== undefined) update.recommendationSource = recommendationSource;

    const plan = await WorkoutPlan.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('exercises.exercise');
    res.json({ plan });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const existing = await WorkoutPlan.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Workout plan not found' });

    const allowed = await canManagePlanForMember(req.user.role, existing.member, req.user._id);
    if (!allowed) {
      return res.status(403).json({ message: 'You can only deactivate workout plans for members assigned to you' });
    }

    const plan = await WorkoutPlan.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    res.json({ message: 'Workout plan deactivated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
