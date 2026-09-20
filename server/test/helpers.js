// Shared test bootstrap for the node:test integration suites.
//
// Runs the real Express app in-process against a dedicated test database.
// Environment is prepared BEFORE any server module is required so that
// rate limiters are disabled (NODE_ENV=test) and a real (non-placeholder)
// UPI id is available to exercise the UPI verification workflow.
'use strict';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/fitsync-ai-test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'fitsync-test-secret';
process.env.UPI_ID = process.env.UPI_ID_TEST || 'testbank@okaxis';
process.env.UPI_NAME = 'Test Gym';
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { app } = require('../server');
const { setGymTimezone } = require('../utils/gymTime');

let server = null;
let baseUrl = '';

const setup = async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  // Rebuild schema indexes (dropDatabase removes them) so DB-level unique
  // guarantees are actually exercised by the integration tests.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  setGymTimezone('Asia/Kolkata');
  server = app.listen(0);
  await new Promise((resolve) => server.on('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  return { baseUrl };
};

const teardown = async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
};

const request = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON response (e.g. SVG QR)
  }
  return { status: res.status, body: data };
};

const uniqueEmail = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.com`;

const registerMember = async ({ name = 'Test Member', email, password = 'Member@123' } = {}) => {
  const res = await request('POST', '/api/auth/register', {
    body: { name, email: email || uniqueEmail('member'), password },
  });
  return { ...res, token: res.body ? res.body.token : null, user: res.body ? res.body.user : null };
};

const createAdmin = async () => {
  const User = require('../models/User');
  const user = await User.create({ name: 'Test Admin', email: uniqueEmail('admin'), password: 'Admin@123', role: 'admin' });
  return user;
};

const createTrainer = async () => {
  const User = require('../models/User');
  const user = await User.create({ name: 'Test Trainer', email: uniqueEmail('trainer'), password: 'Trainer@123', role: 'trainer' });
  return user;
};

const login = async (email, password) => {
  const res = await request('POST', '/api/auth/login', { body: { email, password } });
  return res.body ? res.body.token : null;
};

const adminContext = async () => {
  const user = await createAdmin();
  const token = await login(user.email, 'Admin@123');
  return { user, token };
};

module.exports = {
  setup,
  teardown,
  request,
  registerMember,
  createAdmin,
  createTrainer,
  login,
  adminContext,
  uniqueEmail,
};