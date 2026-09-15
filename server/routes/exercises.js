const express = require('express');
const router = express.Router();
const Exercise = require('../models/Exercise');
const { auth, authorize } = require('../middleware/auth');
const { escapeRegex } = require('../utils/helpers');

router.get('/', auth, async (req, res) => {
  try {
    const { category, muscleGroup, search } = req.query;
    const filter = { isActive: true };
    if (category) filter.category = category;
    if (muscleGroup) filter.muscleGroup = muscleGroup;
    if (search) filter.name = { $regex: escapeRegex(search), $options: 'i' };
    const exercises = await Exercise.find(filter).sort({ name: 1 }).lean();
    res.json({ exercises });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { name, category, muscleGroup, difficulty, description, equipment, isActive } = req.body;
    const exercise = await Exercise.create({
      name,
      category: category || 'strength',
      muscleGroup,
      difficulty: difficulty || 'intermediate',
      description,
      equipment,
      isActive: isActive !== undefined ? isActive : true
    });
    res.status(201).json({ exercise });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { name, category, muscleGroup, difficulty, description, equipment, isActive } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (category !== undefined) update.category = category;
    if (muscleGroup !== undefined) update.muscleGroup = muscleGroup;
    if (difficulty !== undefined) update.difficulty = difficulty;
    if (description !== undefined) update.description = description;
    if (equipment !== undefined) update.equipment = equipment;
    if (isActive !== undefined) update.isActive = isActive;

    const exercise = await Exercise.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!exercise) return res.status(404).json({ message: 'Exercise not found' });
    res.json({ exercise });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    await Exercise.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Exercise removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
