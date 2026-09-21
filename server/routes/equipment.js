const express = require('express');
const router = express.Router();
const Equipment = require('../models/Equipment');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const { escapeRegex } = require('../utils/helpers');

const notifyAdmins = async (title, message, data) => {
  const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
  if (admins.length === 0) return;
  await Notification.insertMany(
    admins.map((a) => ({ user: a._id, title, message, type: 'equipment_maintenance', data }))
  );
};

router.get('/', auth, async (req, res) => {
  try {
    const { category, condition, search } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (condition) filter.condition = condition;
    if (search) filter.name = { $regex: escapeRegex(search), $options: 'i' };
    const equipment = await Equipment.find(filter).sort({ name: 1 }).lean();
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
    })
      .select('name category brand model condition status lastMaintenance nextMaintenance')
      .sort({ nextMaintenance: 1 })
      .lean();
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
    const existing = await Equipment.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Equipment not found' });

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

    if (update.status && update.status !== existing.status &&
        ['under_maintenance', 'out_of_order'].includes(update.status)) {
      await notifyAdmins(
        'Equipment status update',
        `${equipment.name} is now ${update.status.replace(/_/g, ' ')}.`,
        { equipmentId: String(equipment._id) }
      );
    }

    res.json({ equipment });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Staff (admins + trainers) log an operational issue against a piece of
// equipment. The equipment is flagged issue_reported and admins are notified
// so the issue can be followed up and scheduled for maintenance.
router.post('/:id/issue-report', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const { reportedIssue } = req.body;
    if (!reportedIssue || !String(reportedIssue).trim()) {
      return res.status(400).json({ message: 'Describe the issue being reported' });
    }

    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) return res.status(404).json({ message: 'Equipment not found' });

    equipment.status = 'issue_reported';
    equipment.reportedIssue = String(reportedIssue).trim();
    equipment.reportedBy = req.user._id;
    equipment.reportedAt = new Date();
    await equipment.save();

    await notifyAdmins(
      'Equipment issue reported',
      `${equipment.name} has a reported issue: ${equipment.reportedIssue}`,
      { equipmentId: String(equipment._id), reportedBy: String(req.user._id) }
    );

    res.status(201).json({ equipment });
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
    const now = new Date();
    const [total, needsMaintenance, byCondition] = await Promise.all([
      Equipment.countDocuments({ isActive: true }),
      Equipment.countDocuments({ isActive: true, nextMaintenance: { $lte: now } }),
      Equipment.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$condition', count: { $sum: 1 } } }
      ])
    ]);
    res.json({ total, needsMaintenance, byCondition });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
