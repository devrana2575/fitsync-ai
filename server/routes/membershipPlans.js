const express = require('express');
const router = express.Router();
const MembershipPlan = require('../models/MembershipPlan');
const { auth, authorize } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

router.get('/', auth, async (req, res) => {
  try {
    const plans = await MembershipPlan.find({ isActive: true }).sort({ price: 1 });
    res.json({ plans });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/all', auth, authorize('admin'), async (req, res) => {
  try {
    const plans = await MembershipPlan.find().sort({ createdAt: -1 });
    res.json({ plans });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
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

    const plan = await MembershipPlan.create(req.body);
    res.status(201).json({ plan });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const plan = await MembershipPlan.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    res.json({ plan });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
