const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const { startCronJobs, expireMemberships } = require('./utils/cron');
const { initSocket } = require('./utils/socket');

dotenv.config();

connectDB();

const app = express();

app.use(helmet());

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));

const checkout = require('./routes/checkout');
app.post('/api/checkout/webhook', express.raw({ type: 'application/json' }), checkout.webhookHandler);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again later.' }
});

const apiLimiter = rateLimit({
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
app.use('/api/ml', require('./routes/ml'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/classes', require('./routes/classes'));
app.use('/api/nutrition', require('./routes/nutrition'));
app.use('/api/checkout', checkout.router);

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

const PORT = process.env.PORT || 5000;
connectDB()
  .then(() => {
    const httpServer = app.listen(PORT, () => {
      console.log(`FitSync AI Server running on port ${PORT}`);
      startCronJobs();
    });
    initSocket(httpServer);
    expireMemberships().catch((err) => console.error('[Startup] Expiry sweep failed:', err.message));
  })
  .catch((err) => {
    console.error(`[Startup] Failed to start: ${err.message}`);
    process.exit(1);
  });
