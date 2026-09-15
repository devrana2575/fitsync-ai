const express = require('express');
const router = express.Router();
const WorkoutLog = require('../models/WorkoutLog');
const { auth, authorize } = require('../middleware/auth');
const { parsePagination } = require('../utils/helpers');

router.get('/my', auth, async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query.page, req.query.limit, 1, 30, 100);
    const { exerciseId } = req.query;
    const filter = { user: req.user._id };
    if (exerciseId) filter.exercise = exerciseId;
    const total = await WorkoutLog.countDocuments(filter);
    const logs = await WorkoutLog.find(filter)
      .populate('exercise', 'name category muscleGroup')
      .populate('workoutPlan', 'name')
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/member/:userId', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const logs = await WorkoutLog.find({ user: req.params.userId })
      .populate('exercise', 'name category muscleGroup')
      .sort({ date: -1 })
      .limit(50)
      .lean();
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { workoutPlan, exercise, sets, reps, weight, duration, isCompleted, notes } = req.body;
    const log = await WorkoutLog.create({
      user: req.user._id,
      workoutPlan,
      exercise,
      date: new Date(),
      sets,
      reps,
      weight: weight || 0,
      duration: duration || 0,
      isCompleted: isCompleted !== false,
      notes
    });
    res.status(201).json({ log });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user._id;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalWorkouts, completedWorkouts, weeklyFrequency] = await Promise.all([
      WorkoutLog.countDocuments({ user: userId }),
      WorkoutLog.countDocuments({ user: userId, isCompleted: true }),
      WorkoutLog.aggregate([
        { $match: { user: userId, date: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $week: '$date' }, count: { $sum: 1 } } }
      ])
    ]);

    const recentWorkouts = weeklyFrequency.reduce((sum, w) => sum + w.count, 0);

    res.json({ totalWorkouts, completedWorkouts, recentWorkouts, weeklyFrequency });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
