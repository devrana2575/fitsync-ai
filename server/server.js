const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const { startCronJobs, expireMemberships } = require('./utils/cron');
const { initSocket } = require('./utils/socket');
const { setGymTimezone, getGymDateKey } = require('./utils/gymTime');
const { bootstrapAdmin } = require('./utils/bootstrapAdmin');
const { ensureProductionPaymentConfig } = require('./utils/paymentConfig');
const Attendance = require('./models/Attendance');
const GymSetting = require('./models/GymSetting');

dotenv.config();

const isTestEnv = () => process.env.NODE_ENV === 'test';

const createLimiter = (options) => (isTestEnv() ? (req, res, next) => next() : rateLimit(options));

const createApp = () => {
  const app = express();

  app.use(helmet());

  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
  }));

  const checkout = require('./routes/checkout');
  app.post('/api/checkout/webhook', express.raw({ type: 'application/json' }), checkout.webhookHandler);

  // Razorpay webhook - raw body is required for HMAC signature verification.
  const razorpayWebhook = require('./routes/razorpayWebhook');
  app.post('/api/payments/razorpay/webhook', express.raw({ type: 'application/json' }), razorpayWebhook);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  const authLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many login attempts. Please try again later.' }
  });

  const apiLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests. Please try again later.' }
  });

  app.use('/api/auth', authLimiter);
  app.use('/api', apiLimiter);

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/members', require('./routes/members'));
  app.use('/api/trainers', require('./routes/trainers'));
  app.use('/api/membership-plans', require('./routes/membershipPlans'));
  app.use('/api/memberships', require('./routes/memberships'));
  app.use('/api/payments', require('./routes/payments'));
  app.use('/api/attendance', require('./routes/attendance'));
  app.use('/api/workouts', require('./routes/workouts'));
  app.use('/api/exercises', require('./routes/exercises'));
  app.use('/api/workout-logs', require('./routes/workoutLogs'));
  app.use('/api/goals', require('./routes/goals'));
  app.use('/api/measurements', require('./routes/measurements'));
  app.use('/api/equipment', require('./routes/equipment'));
  app.use('/api/notifications', require('./routes/notifications'));
  app.use('/api/analytics', require('./routes/analytics'));
  app.use('/api/reports', require('./routes/reports'));
  app.use('/api/settings', require('./routes/settings'));
  app.use('/api/diet', require('./routes/diet'));
  app.use('/api/checkout', checkout.router);
  app.use('/api/templates', require('./routes/templates'));
  app.use('/api/photos', require('./routes/progressPhotos'));
  app.use('/api/announcements', require('./routes/announcements'));
  app.use('/api/recommendations', require('./routes/recommendations'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'fitsync-ai-api' });
  });

  app.use((req, res, next) => {
    res.status(404).json({ message: 'Not found' });
  });

  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ message: 'Invalid request format' });
    }
    if (err.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid identifier' });
    }
    console.error(err.stack || err);
    const status = err.status || err.statusCode || 500;
    const safeStatus = status >= 400 && status < 600 ? status : 500;
    res.status(safeStatus).json({ message: safeStatus >= 500 ? 'Internal server error' : 'Request failed' });
  });

  return app;
};

const app = createApp();

// Load the configured gym timezone once at startup so all gym-day math runs
// in the gym's local calendar from the first request.
const loadGymTimezone = async () => {
  const settings = await GymSetting.findOne().select('timezone').lean();
  if (settings && settings.timezone) setGymTimezone(settings.timezone);
};

// One-time backfill: legacy attendance rows predate dayKey, which now powers
// per-gym-day uniqueness. Assign dayKey from the stored instant's gym-local
// date. Idempotent and safe (only touches rows that still lack dayKey).
const backfillAttendanceDayKeys = async () => {
  const dates = await Attendance.distinct('date', { dayKey: { $exists: false } });
  let updated = 0;
  for (const date of dates) {
    const dayKey = getGymDateKey(new Date(date));
    const res = await Attendance.updateMany(
      { date, dayKey: { $exists: false } },
      { $set: { dayKey } }
    );
    updated += res.modifiedCount;
  }
  if (updated > 0) console.log(`[Startup] Attendance dayKey backfill: ${updated} record(s) updated`);
  return updated;
};

const startServer = async (options = {}) => {
  const { skipBootstrap = false } = options;
  await connectDB();
  await loadGymTimezone();
  await backfillAttendanceDayKeys();

  if (!skipBootstrap) {
    const result = await bootstrapAdmin();
    if (result.status === 'created') {
      console.log(`[Startup] Created initial admin account for ${result.email}`);
    }
  }

  // A production server without a real gateway must refuse to boot rather
  // than silently accept "demo" payments or placeholder UPI ids.
  ensureProductionPaymentConfig();

  const PORT = process.env.PORT || 5000;
  const httpServer = app.listen(PORT, () => {
    console.log(`FitSync AI Server running on port ${PORT}`);
    startCronJobs();
  });
  initSocket(httpServer);
  expireMemberships().catch((err) => console.error('[Startup] Expiry sweep failed:', err.message));
  return httpServer;
};

if (require.main === module) {
  startServer().catch((err) => {
    console.error(`[Startup] Failed to start: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { app, createApp, startServer, loadGymTimezone, backfillAttendanceDayKeys };