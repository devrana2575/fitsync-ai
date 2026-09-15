const express = require('express');
const router = express.Router();
const Announcement = require('../models/Announcement');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const { escapeRegex, parsePagination } = require('../utils/helpers');
const { bulkCreateNotifications } = require('../utils/notify');

router.get('/', auth, async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query.page, req.query.limit, 1, 20, 100);
    const filter = req.user.role === 'member' ? { isActive: true } : {};
    if (req.query.search) filter.title = { $regex: escapeRegex(req.query.search), $options: 'i' };

    const now = new Date();
    if (req.user.role === 'member') {
      filter.$or = [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gte: now } }];
    }

    const total = await Announcement.countDocuments(filter);
    const announcements = await Announcement.find(filter)
      .populate('createdBy', 'name')
      .sort({ pinned: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({ announcements, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { title, message, priority, pinned, expiresAt } = req.body;
    if (!title || !message) return res.status(400).json({ message: 'Title and message are required' });
    const announcement = await Announcement.create({
      title,
      message,
      createdBy: req.user._id,
      priority: priority || 'info',
      pinned: pinned || false,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined
    });

    if ((priority || 'info') === 'critical') {
      const members = await User.find({ role: 'member', isActive: true }).select('_id').lean();
      if (members.length > 0) {
        await bulkCreateNotifications(members.map((m) => ({
          user: m._id,
          title: announcement.title,
          message: announcement.message.slice(0, 140),
          type: 'announcement'
        })));
      }
    }

    res.status(201).json({ announcement });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const allowed = ['title', 'message', 'priority', 'pinned', 'expiresAt', 'isActive'];
    const update = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const announcement = await Announcement.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!announcement) return res.status(404).json({ message: 'Announcement not found' });
    res.json({ announcement });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) return res.status(404).json({ message: 'Announcement not found' });
    announcement.isActive = false;
    await announcement.save();
    res.json({ message: 'Announcement deactivated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;