const express = require('express');
const router = express.Router();
const WorkoutLog = require('../models/WorkoutLog');
const { auth } = require('../middleware/auth');

router.get('/my', auth, async (req, res) => {
  try {
    const { page = 1, limit = 30, exerciseId } = req.query;
    const filter = { user: req.user._id };
    if (exerciseId) filter.exercise = exerciseId;
    const total = await WorkoutLog.countDocuments(filter);
    const logs = await WorkoutLog.find(filter)
      .populate('exercise', 'name category muscleGroup')
      .populate('workoutPlan', 'name')
      .sort({ date: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    res.json({ logs, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/member/:userId', auth, async (req, res) => {
  try {
    const isSelf = req.params.userId === String(req.user._id);
    if (!isSelf && req.user.role !== 'admin' && req.user.role !== 'trainer') {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }
    const logs = await WorkoutLog.find({ user: req.params.userId })
      .populate('exercise', 'name category muscleGroup')
      .sort({ date: -1 })
      .limit(50);
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const totalWorkouts = await WorkoutLog.countDocuments({ user: userId });
    const completedWorkouts = await WorkoutLog.countDocuments({ user: userId, isCompleted: true });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentWorkouts = await WorkoutLog.countDocuments({
      user: userId,
      date: { $gte: thirtyDaysAgo }
    });

    const weeklyFrequency = await WorkoutLog.aggregate([
      { $match: { user: userId, date: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $week: '$date' }, count: { $sum: 1 } } }
    ]);

    res.json({ totalWorkouts, completedWorkouts, recentWorkouts, weeklyFrequency });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
