const express = require('express');
const router = express.Router();
const FitnessGoal = require('../models/FitnessGoal');
const { auth } = require('../middleware/auth');

// Goal types that are achieved by moving DOWN toward the target (e.g. weight loss).
const DOWN_GOALS = new Set(['weight_loss']);

function isGoalAchieved(goal, current) {
  return DOWN_GOALS.has(goal.type) ? current <= goal.target : current >= goal.target;
}

router.get('/my', auth, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { user: req.user._id };
    if (status) filter.status = status;
    const goals = await FitnessGoal.find(filter).sort({ createdAt: -1 });
    res.json({ goals });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { type, title, description, target, current, unit, targetDate, start } = req.body;
    const currentValue = current || 0;
    const goal = await FitnessGoal.create({
      user: req.user._id,
      type,
      title,
      description,
      target,
      current: currentValue,
      start: start !== undefined ? start : (currentValue > 0 ? currentValue : null),
      unit: unit || 'kg',
      targetDate
    });
    res.status(201).json({ goal });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { type, title, description, target, current, unit, targetDate, status, start } = req.body;
    const update = {};
    if (type !== undefined) update.type = type;
    if (title !== undefined) update.title = title;
    if (description !== undefined) update.description = description;
    if (target !== undefined) update.target = target;
    if (current !== undefined) update.current = current;
    if (unit !== undefined) update.unit = unit;
    if (targetDate !== undefined) update.targetDate = targetDate;
    if (status !== undefined) update.status = status;
    if (start !== undefined) update.start = start;

    const goal = await FitnessGoal.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      update,
      { new: true }
    );
    if (!goal) return res.status(404).json({ message: 'Goal not found' });
    res.json({ goal });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id/progress', auth, async (req, res) => {
  try {
    const { current } = req.body;
    const goal = await FitnessGoal.findOne({ _id: req.params.id, user: req.user._id });
    if (!goal) return res.status(404).json({ message: 'Goal not found' });
    goal.current = current;
    if (isGoalAchieved(goal, current)) goal.status = 'COMPLETED';
    await goal.save();
    res.json({ goal });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await FitnessGoal.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    res.json({ message: 'Goal deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
