const express = require('express');
const router = express.Router();
const DietLog = require('../models/DietLog');
const { DIET_TYPES } = DietLog;
const { auth, authorize } = require('../middleware/auth');

const parseDay = (str) => {
  const d = str ? new Date(`${str}T00:00:00`) : new Date();
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};

// ----------------------------------------------------------------
// Diet types
// ----------------------------------------------------------------
router.get('/types', auth, (req, res) => {
  res.json({ diets: Object.entries(DIET_TYPES).map(([value, label]) => ({ value, label })) });
});

// ----------------------------------------------------------------
// Diet checklist logs
// ----------------------------------------------------------------
router.get('/log', auth, authorize('member'), async (req, res) => {
  try {
    const { date } = req.query;
    const filter = { user: req.user._id };
    if (date) {
      const day = parseDay(date);
      if (!day) return res.status(400).json({ message: 'Invalid date' });
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      filter.date = { $gte: day, $lt: next };
    } else {
      filter.date = { $gte: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) };
    }
    const logs = await DietLog.find(filter).sort({ date: -1 }).limit(31).lean();
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/log', auth, authorize('member'), async (req, res) => {
  try {
    const { date, dietType, completed } = req.body;
    if (!dietType || !DIET_TYPES[dietType]) return res.status(400).json({ message: 'Invalid diet type' });
    const day = parseDay(date);
    if (!day) return res.status(400).json({ message: 'Invalid date' });

    let log = await DietLog.findOne({ user: req.user._id, date: day });
    if (!log) log = await DietLog.create({ user: req.user._id, date: day, completedDiets: [] });

    const idx = log.completedDiets.indexOf(dietType);
    if (completed && idx === -1) log.completedDiets.push(dietType);
    if (!completed && idx !== -1) log.completedDiets.splice(idx, 1);
    await log.save();
    res.json({ log });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ----------------------------------------------------------------
// Stats
// ----------------------------------------------------------------
router.get('/stats', auth, authorize('member'), async (req, res) => {
  try {
    const today = parseDay();
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    const logs = await DietLog.find({ user: req.user._id, date: { $gte: from, $lte: today } }).sort({ date: -1 }).lean();

    const last7Days = logs.map((l) => ({
      date: l.date,
      count: l.completedDiets.length
    }));

    const todayLog = logs.find((l) => l.date.toDateString() === today.toDateString());
    const completedToday = todayLog ? todayLog.completedDiets.length : 0;

    let streak = 0;
    const completedDaySet = new Set(logs.filter((l) => l.completedDiets.length > 0).map((l) => l.date.toDateString()));
    const cursor = new Date(today);
    if (!completedDaySet.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
    while (completedDaySet.has(cursor.toDateString())) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    res.json({ last7Days, completedToday, totalDiets: Object.keys(DIET_TYPES).length, streak });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;