const express = require('express');
const router = express.Router();
const FitnessGoal = require('../models/FitnessGoal');
const { auth } = require('../middleware/auth');

router.get('/my', auth, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { user: req.user._id };
    if (status) filter.status = status;
    const goals = await FitnessGoal.find(filter).sort({ createdAt: -1 });
    res.json({ goals });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { type, title, description, target, current, unit, targetDate } = req.body;
    const goal = await FitnessGoal.create({
      user: req.user._id,
      type,
      title,
      description,
      target,
      current: current || 0,
      unit: unit || 'kg',
      targetDate
    });
    res.status(201).json({ goal });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const goal = await FitnessGoal.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      req.body,
      { new: true }
    );
    if (!goal) return res.status(404).json({ message: 'Goal not found' });
    res.json({ goal });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id/progress', auth, async (req, res) => {
  try {
    const { current } = req.body;
    const goal = await FitnessGoal.findOne({ _id: req.params.id, user: req.user._id });
    if (!goal) return res.status(404).json({ message: 'Goal not found' });
    goal.current = current;
    if (current >= goal.target) goal.status = 'COMPLETED';
    await goal.save();
    res.json({ goal });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await FitnessGoal.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    res.json({ message: 'Goal deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
