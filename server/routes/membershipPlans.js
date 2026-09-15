const express = require('express');
const router = express.Router();
const MembershipPlan = require('../models/MembershipPlan');
const { auth, authorize } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

router.get('/', auth, async (req, res) => {
  try {
    const plans = await MembershipPlan.find({ isActive: true }).sort({ price: 1 }).lean();
    res.json({ plans });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/all', auth, authorize('admin'), async (req, res) => {
  try {
    const plans = await MembershipPlan.find().sort({ createdAt: -1 }).lean();
    res.json({ plans });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, authorize('admin'), [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('price').isNumeric().withMessage('Price is required'),
  body('duration').isInt({ min: 1 }).withMessage('Duration is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { name, price, duration, description, features, isActive } = req.body;
    const plan = await MembershipPlan.create({
      name,
      price,
      duration,
      description,
      features: features || [],
      isActive: isActive !== undefined ? isActive : true
    });
    res.status(201).json({ plan });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { name, price, duration, description, features, isActive } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (price !== undefined) update.price = price;
    if (duration !== undefined) update.duration = duration;
    if (description !== undefined) update.description = description;
    if (features !== undefined) update.features = features;
    if (isActive !== undefined) update.isActive = isActive;

    const plan = await MembershipPlan.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    res.json({ plan });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const plan = await MembershipPlan.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    res.json({ message: 'Plan deactivated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
