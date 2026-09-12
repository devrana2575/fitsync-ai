const express = require('express');
const router = express.Router();
const GymBranch = require('../models/GymBranch');
const { auth, authorize } = require('../middleware/auth');
const { escapeRegex, parsePagination } = require('../utils/helpers');

router.get('/', auth, async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query.page, req.query.limit, 1, 20, 100);
    const filter = req.user.role === 'member' ? { isActive: true } : {};
    if (req.query.search) filter.name = { $regex: escapeRegex(req.query.search), $options: 'i' };

    const total = await GymBranch.countDocuments(filter);
    const branches = await GymBranch.find(filter)
      .populate('manager', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({ branches, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { name, code, address, phone, email, manager, operatingHours } = req.body;
    if (!name || !code) return res.status(400).json({ message: 'Name and code are required' });
    const branch = await GymBranch.create({
      name,
      code,
      address,
      phone,
      email,
      manager: manager || undefined,
      operatingHours
    });
    res.status(201).json({ branch });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'Branch code already exists' });
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const allowed = ['name', 'code', 'address', 'phone', 'email', 'manager', 'operatingHours', 'isActive'];
    const update = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const branch = await GymBranch.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!branch) return res.status(404).json({ message: 'Branch not found' });
    res.json({ branch });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'Branch code already exists' });
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const branch = await GymBranch.findById(req.params.id);
    if (!branch) return res.status(404).json({ message: 'Branch not found' });
    branch.isActive = false;
    await branch.save();
    res.json({ message: 'Branch deactivated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;