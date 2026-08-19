const express = require('express');
const router = express.Router();
const Exercise = require('../models/Exercise');
const { auth, authorize } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { category, muscleGroup, search } = req.query;
    const filter = { isActive: true };
    if (category) filter.category = category;
    if (muscleGroup) filter.muscleGroup = muscleGroup;
    if (search) filter.name = { $regex: search, $options: 'i' };
    const exercises = await Exercise.find(filter).sort({ name: 1 });
    res.json({ exercises });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const exercise = await Exercise.create(req.body);
    res.status(201).json({ exercise });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const exercise = await Exercise.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!exercise) return res.status(404).json({ message: 'Exercise not found' });
    res.json({ exercise });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    await Exercise.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Exercise removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
