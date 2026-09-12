const express = require('express');
const router = express.Router();
const Membership = require('../models/Membership');
const MembershipPlan = require('../models/MembershipPlan');
const { auth, authorize } = require('../middleware/auth');
const { parsePagination } = require('../utils/helpers');

router.get('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query.page, req.query.limit, 1, 20, 100);
    const { status, userId } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (userId) filter.user = userId;

    const total = await Membership.countDocuments(filter);
    const memberships = await Membership.find(filter)
      .populate('user', 'name email')
      .populate('plan')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({ memberships, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/my', auth, async (req, res) => {
  try {
    const memberships = await Membership.find({ user: req.user._id })
      .populate('plan')
      .sort({ createdAt: -1 });
    res.json({ memberships });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/active/:userId', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const membership = await Membership.findOne({ user: req.params.userId, status: 'ACTIVE' }).populate('plan');
    res.json({ membership });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { userId, planId, startDate, autoRenew } = req.body;

    const plan = await MembershipPlan.findById(planId);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });

    const start = startDate ? new Date(startDate) : new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + plan.duration);

    const existingActive = await Membership.findOne({ user: userId, status: 'ACTIVE' });
    if (existingActive) {
      existingActive.status = 'CANCELLED';
      await existingActive.save();
    }

    const membership = await Membership.create({
      user: userId,
      plan: planId,
      startDate: start,
      endDate: end,
      status: 'ACTIVE',
      autoRenew: autoRenew || false
    });

    const populated = await membership.populate(['plan', 'user']);
    res.status(201).json({ membership: populated });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id/renew', auth, authorize('admin'), async (req, res) => {
  try {
    const membership = await Membership.findById(req.params.id).populate('plan');
    if (!membership) return res.status(404).json({ message: 'Membership not found' });

    const newStart = new Date();
    const newEnd = new Date(newStart);
    newEnd.setDate(newEnd.getDate() + membership.plan.duration);

    membership.startDate = newStart;
    membership.endDate = newEnd;
    membership.status = 'ACTIVE';
    await membership.save();

    res.json({ membership });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id/cancel', auth, authorize('admin'), async (req, res) => {
  try {
    const membership = await Membership.findByIdAndUpdate(
      req.params.id,
      { status: 'CANCELLED' },
      { new: true }
    );
    if (!membership) return res.status(404).json({ message: 'Membership not found' });
    res.json({ membership });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/stats', auth, authorize('admin'), async (req, res) => {
  try {
    const active = await Membership.countDocuments({ status: 'ACTIVE' });
    const expired = await Membership.countDocuments({ status: 'EXPIRED' });
    const pending = await Membership.countDocuments({ status: 'PENDING' });
    const cancelled = await Membership.countDocuments({ status: 'CANCELLED' });

    const now = new Date();
    const thirtyDays = new Date(now);
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const expiringSoon = await Membership.countDocuments({
      status: 'ACTIVE',
      endDate: { $lte: thirtyDays, $gte: now }
    });

    res.json({ active, expired, pending, cancelled, expiringSoon });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
