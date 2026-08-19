const express = require('express');
const router = express.Router();
const Equipment = require('../models/Equipment');
const { auth, authorize } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { category, condition, search } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (condition) filter.condition = condition;
    if (search) filter.name = { $regex: search, $options: 'i' };
    const equipment = await Equipment.find(filter).sort({ name: 1 });
    res.json({ equipment });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/maintenance', auth, authorize('admin'), async (req, res) => {
  try {
    const now = new Date();
    const upcoming = await Equipment.find({
      nextMaintenance: { $lte: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) },
      isActive: true
    }).sort({ nextMaintenance: 1 });
    res.json({ equipment: upcoming });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const equipment = await Equipment.create(req.body);
    res.status(201).json({ equipment });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const equipment = await Equipment.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!equipment) return res.status(404).json({ message: 'Equipment not found' });
    res.json({ equipment });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    await Equipment.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Equipment deactivated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/stats', auth, authorize('admin'), async (req, res) => {
  try {
    const total = await Equipment.countDocuments({ isActive: true });
    const needsMaintenance = await Equipment.countDocuments({
      isActive: true,
      nextMaintenance: { $lte: new Date() }
    });
    const byCondition = await Equipment.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$condition', count: { $sum: 1 } } }
    ]);
    res.json({ total, needsMaintenance, byCondition });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
