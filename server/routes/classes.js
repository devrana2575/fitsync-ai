const express = require('express');
const router = express.Router();
const GymClass = require('../models/GymClass');
const ClassSession = require('../models/ClassSession');
const ClassBooking = require('../models/ClassBooking');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const { escapeRegex, parsePagination } = require('../utils/helpers');

// ----------------------------------------------------------------
// Class definitions (CRUD)
// ----------------------------------------------------------------
router.get('/', auth, async (req, res) => {
  try {
    const { search, category } = req.query;
    const filter = {};
    if (req.user.role !== 'admin') filter.isActive = true;
    if (search) filter.name = { $regex: escapeRegex(search), $options: 'i' };
    if (category) filter.category = category;
    const classes = await GymClass.find(filter).sort({ name: 1 });
    res.json({ classes });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { name, category, difficulty, description, defaultDuration, defaultCapacity, isActive } = req.body;
    if (!name) return res.status(400).json({ message: 'Class name is required' });
    const gymClass = await GymClass.create({
      name,
      category: category || 'group_fitness',
      difficulty: difficulty || 'all_levels',
      description,
      defaultDuration,
      defaultCapacity,
      isActive: isActive !== undefined ? isActive : true
    });
    res.status(201).json({ gymClass });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'A class with this name already exists' });
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const allowed = ['name', 'category', 'difficulty', 'description', 'defaultDuration', 'defaultCapacity', 'isActive'];
    const update = {};
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    });
    if (Object.keys(update).length === 0) return res.status(400).json({ message: 'Nothing to update' });
    const gymClass = await GymClass.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!gymClass) return res.status(404).json({ message: 'Class not found' });
    res.json({ gymClass });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'A class with this name already exists' });
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    await GymClass.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: 'Class deactivated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ----------------------------------------------------------------
// Sessions (scheduled instances)
// ----------------------------------------------------------------
const attachBookingCounts = async (sessions, userId) => {
  const ids = sessions.map((s) => s._id);
  const [bookedAgg, waitAgg, mineAgg] = await Promise.all([
    ClassBooking.aggregate([
      { $match: { session: { $in: ids }, status: 'booked' } },
      { $group: { _id: '$session', count: { $sum: 1 } } }
    ]),
    ClassBooking.aggregate([
      { $match: { session: { $in: ids }, status: 'waitlisted' } },
      { $group: { _id: '$session', count: { $sum: 1 } } }
    ]),
    userId ? ClassBooking.find({ session: { $in: ids }, user: userId, status: { $in: ['booked', 'waitlisted'] } }).select('session status -_id').lean() : Promise.resolve([])
  ]);
  const bookedMap = new Map(bookedAgg.map((b) => [String(b._id), b.count]));
  const waitMap = new Map(waitAgg.map((b) => [String(b._id), b.count]));
  const mineMap = new Map(mineAgg.map((b) => [String(b.session), b.status]));
  return sessions.map((s) => {
    const doc = s.toObject ? s.toObject() : s;
    doc.bookedCount = bookedMap.get(String(s._id)) || 0;
    doc.waitlistedCount = waitMap.get(String(s._id)) || 0;
    doc.spotsLeft = Math.max(0, (s.capacity || 0) - doc.bookedCount);
    doc.myStatus = mineMap.get(String(s._id)) || null;
    return doc;
  });
};

router.get('/sessions', auth, async (req, res) => {
  try {
    const { from, to, classId, trainerId, status } = req.query;
    const filter = {};
    if (from || to) {
      filter.startsAt = {};
      if (from) filter.startsAt.$gte = new Date(from);
      if (to) filter.startsAt.$lte = new Date(to);
    }
    if (classId) filter.gymClass = classId;
    if (trainerId) filter.trainer = trainerId;
    if (status) filter.status = status;
    else if (req.user.role !== 'admin') filter.status = 'scheduled';

    let sessions = await ClassSession.find(filter)
      .populate('gymClass', 'name category difficulty')
      .populate('trainer', 'name')
      .sort({ startsAt: 1 });

    if (req.user.role === 'trainer') {
      sessions = sessions.filter((s) => String(s.trainer._id) === String(req.user._id));
    }

    if (req.user.role === 'member') {
      sessions = sessions.filter((s) => new Date(s.startsAt) > new Date(Date.now() - 60 * 60 * 1000));
    }

    const enriched = await attachBookingCounts(sessions, req.user.role === 'member' ? req.user._id : null);
    res.json({ sessions: enriched });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/sessions', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const { gymClass, trainer, startsAt, duration, location, capacity, waitlistLimit, notes, repeatWeekly, repeatCount } = req.body;
    if (!gymClass || !startsAt) return res.status(400).json({ message: 'Class and start time are required' });

    const cls = await GymClass.findById(gymClass);
    if (!cls) return res.status(400).json({ message: 'Class not found' });

    const assignedTrainer = trainer || (req.user.role === 'trainer' ? req.user._id : null);
    if (!assignedTrainer) return res.status(400).json({ message: 'Trainer is required' });
    const trainerUser = await User.findOne({ _id: assignedTrainer, role: 'trainer', isActive: true });
    if (!trainerUser) return res.status(400).json({ message: 'Trainer not found or inactive' });

    const base = {
      duration: duration || cls.defaultDuration,
      location: location || 'Main Studio',
      capacity: capacity || cls.defaultCapacity,
      waitlistLimit: waitlistLimit !== undefined ? waitlistLimit : 5,
      notes
    };

    const count = repeatWeekly && repeatCount > 0 ? Math.min(parseInt(repeatCount), 12) : 1;
    const created = [];
    for (let i = 0; i < count; i++) {
      const sessionStart = new Date(startsAt);
      if (i > 0) sessionStart.setDate(sessionStart.getDate() + 7 * i);
      created.push(await ClassSession.create({ gymClass, trainer: assignedTrainer, startsAt: sessionStart, ...base }));
    }
    res.status(201).json({ sessions: created });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/sessions/:id', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const session = await ClassSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    if (req.user.role === 'trainer' && String(session.trainer) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only manage your own sessions' });
    }
    const allowed = ['trainer', 'startsAt', 'duration', 'location', 'capacity', 'waitlistLimit', 'status', 'notes'];
    const update = {};
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    });
    const updated = await ClassSession.findByIdAndUpdate(session._id, update, { new: true });
    res.json({ session: updated });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/sessions/:id', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const session = await ClassSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    if (req.user.role === 'trainer' && String(session.trainer) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only manage your own sessions' });
    }
    session.status = 'cancelled';
    await session.save();
    const affected = await ClassBooking.find({ session: session._id, status: { $in: ['booked', 'waitlisted'] } }).select('user').lean();
    await ClassBooking.updateMany({ _id: { $in: affected.map((b) => b._id) } }, { $set: { status: 'cancelled' } });
    if (affected.length > 0) {
      await Notification.insertMany(
        affected.map((b) => ({
          user: b.user,
          title: 'Class Cancelled',
          message: `A class session you had ${b.status === 'waitlisted' ? 'waitlisted for' : 'booked'} has been cancelled.`,
          type: 'class_update'
        }))
      );
    }
    res.json({ message: 'Session cancelled' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ----------------------------------------------------------------
// Bookings
// ----------------------------------------------------------------
router.post('/sessions/:id/book', auth, authorize('member'), async (req, res) => {
  try {
    const session = await ClassSession.findById(req.params.id).populate('gymClass', 'name');
    if (!session) return res.status(404).json({ message: 'Session not found' });
    if (session.status !== 'scheduled') return res.status(400).json({ message: 'This session is no longer available' });
    if (new Date(session.startsAt) < new Date()) return res.status(400).json({ message: 'This session has already started' });

    const existing = await ClassBooking.findOne({ session: session._id, user: req.user._id });
    if (existing && existing.status === 'booked') return res.status(400).json({ message: 'You have already booked this class' });
    if (existing && existing.status === 'waitlisted') return res.status(400).json({ message: 'You are already on the waitlist' });

    const bookedCount = await ClassBooking.countDocuments({ session: session._id, status: 'booked' });
    let status = 'booked';
    let message = `You are booked for ${session.gymClass.name}`;
    if (bookedCount >= session.capacity) {
      const waitlistedCount = await ClassBooking.countDocuments({ session: session._id, status: 'waitlisted' });
      if (waitlistedCount >= session.waitlistLimit) {
        return res.status(400).json({ message: 'This session is full and the waitlist is closed' });
      }
      status = 'waitlisted';
      message = `This class is full. You have been added to the waitlist.`;
    }

    if (existing) {
      existing.status = status;
      existing.checkedIn = false;
      existing.bookedAt = new Date();
      await existing.save();
    } else {
      await ClassBooking.create({ session: session._id, user: req.user._id, status });
    }

    if (session.trainer) {
      await Notification.create({
        user: session.trainer,
        title: 'New Class Booking',
        message: `A member ${status === 'waitlisted' ? 'joined the waitlist for' : 'booked'} ${session.gymClass.name}.`,
        type: 'class_update'
      });
    }

    res.status(201).json({ status, message });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/sessions/:id/cancel', auth, authorize('member'), async (req, res) => {
  try {
    const session = await ClassSession.findById(req.params.id).populate('gymClass', 'name');
    if (!session) return res.status(404).json({ message: 'Session not found' });

    const booking = await ClassBooking.findOne({ session: session._id, user: req.user._id, status: { $in: ['booked', 'waitlisted'] } });
    if (!booking) return res.status(400).json({ message: 'No active booking found for this session' });

    const wasWaitlisted = booking.status === 'waitlisted';
    booking.status = 'cancelled';
    booking.checkedIn = false;
    await booking.save();

    if (!wasWaitlisted && session.status === 'scheduled') {
      const nextWaitlist = await ClassBooking.findOne({ session: session._id, status: 'waitlisted' }).sort({ bookedAt: 1, _id: 1 });
      if (nextWaitlist) {
        nextWaitlist.status = 'booked';
        await nextWaitlist.save();
        await Notification.create({
          user: nextWaitlist.user,
          title: 'Spot Available',
          message: `A spot just opened up for ${session.gymClass.name}. You have been moved from the waitlist to booked.`,
          type: 'class_update'
        });
      }
    }

    res.json({ message: 'Booking cancelled' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/sessions/:id/bookings', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const session = await ClassSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    if (req.user.role === 'trainer' && String(session.trainer) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only view your own sessions' });
    }
    const bookings = await ClassBooking.find({ session: session._id, status: { $in: ['booked', 'waitlisted'] } })
      .populate('user', 'name email')
      .sort({ status: 1, bookedAt: 1 });
    res.json({ bookings });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/sessions/:id/checkin', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const session = await ClassSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    if (req.user.role === 'trainer' && String(session.trainer) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only manage your own sessions' });
    }
    const booking = await ClassBooking.findOne({ session: session._id, user: req.body.userId, status: 'booked' });
    if (!booking) return res.status(400).json({ message: 'Member is not booked for this session' });
    booking.checkedIn = true;
    await booking.save();
    res.json({ booking });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ----------------------------------------------------------------
// My upcoming bookings
// ----------------------------------------------------------------
router.get('/my/bookings', auth, authorize('member'), async (req, res) => {
  try {
    const bookings = await ClassBooking.find({ user: req.user._id, status: { $in: ['booked', 'waitlisted'] } })
      .populate({
        path: 'session',
        match: { startsAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, status: 'scheduled' },
        populate: { path: 'gymClass', select: 'name category difficulty' }
      })
      .populate({ path: 'user', select: 'name' })
      .sort({ bookedAt: -1 });
    const upcoming = bookings.filter((b) => b.session);
    res.json({ bookings: upcoming });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ----------------------------------------------------------------
// Stats
// ----------------------------------------------------------------
router.get('/stats', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const match = req.user.role === 'trainer' ? { trainer: req.user._id } : {};
    const totalSessions = await ClassSession.countDocuments({ ...match, status: { $ne: 'cancelled' } });
    const upcomingSessions = await ClassSession.countDocuments({ ...match, status: 'scheduled', startsAt: { $gte: new Date() } });
    const totalBookings = await ClassBooking.countDocuments({ ...match, status: 'booked' });
    const waitlistCount = await ClassBooking.countDocuments({ ...match, status: 'waitlisted' });
    const classCount = await GymClass.countDocuments({ isActive: true });

    const byCategory = await GymClass.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    res.json({ totalSessions, upcomingSessions, totalBookings, waitlistCount, classCount, byCategory });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;