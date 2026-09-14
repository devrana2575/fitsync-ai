const express = require('express');
const router = express.Router();
const Equipment = require('../models/Equipment');
const { auth, authorize } = require('../middleware/auth');
const { escapeRegex } = require('../utils/helpers');

router.get('/', auth, async (req, res) => {
  try {
    const { category, condition, search } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (condition) filter.condition = condition;
    if (search) filter.name = { $regex: escapeRegex(search), $options: 'i' };
    const equipment = await Equipment.find(filter).sort({ name: 1 });
    res.json({ equipment });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
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
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { name, category, brand, model, condition, status, purchaseDate, lastMaintenance, nextMaintenance, location, description, notes, isActive } = req.body;
    const equipment = await Equipment.create({
      name,
      category: category || 'strength',
      brand,
      model,
      condition: condition || 'good',
      status: status || 'available',
      purchaseDate,
      lastMaintenance,
      nextMaintenance,
      location,
      description,
      notes,
      isActive: isActive !== undefined ? isActive : true
    });
    res.status(201).json({ equipment });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { name, category, brand, model, condition, status, purchaseDate, lastMaintenance, nextMaintenance, location, description, notes, isActive } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (category !== undefined) update.category = category;
    if (brand !== undefined) update.brand = brand;
    if (model !== undefined) update.model = model;
    if (condition !== undefined) update.condition = condition;
    if (status !== undefined) update.status = status;
    if (purchaseDate !== undefined) update.purchaseDate = purchaseDate;
    if (lastMaintenance !== undefined) update.lastMaintenance = lastMaintenance;
    if (nextMaintenance !== undefined) update.nextMaintenance = nextMaintenance;
    if (location !== undefined) update.location = location;
    if (description !== undefined) update.description = description;
    if (notes !== undefined) update.notes = notes;
    if (isActive !== undefined) update.isActive = isActive;

    const equipment = await Equipment.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!equipment) return res.status(404).json({ message: 'Equipment not found' });
    res.json({ equipment });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    await Equipment.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Equipment deactivated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
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
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
