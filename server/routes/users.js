const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const { escapeRegex, parsePagination } = require('../utils/helpers');

router.get('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query.page, req.query.limit, 1, 10, 100);
    const { search, role, status } = req.query;
    const filter = {};
    if (search) {
      const escaped = escapeRegex(search);
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } }
      ];
    }
    if (role) filter.role = role;
    if (status === 'active') filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select('name email role isActive avatar createdAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      users,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id/activate', auth, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id/deactivate', auth, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    // Soft-delete: the user (and therefore their memberships, payments,
    // attendance, workout plans, goals, measurements and notifications)
    // stays in the database so no referencing record is ever orphaned and
    // history remains traceable. Reactivate with PUT /:id/activate.
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deactivated. All history is preserved; use /activate to restore.', user });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
