'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, request } = require('./helpers');
const { bootstrapAdmin } = require('../utils/bootstrapAdmin');
const User = require('../models/User');

before(setup);
after(teardown);

const withAdminCreds = (vars) => {
  const saved = {};
  for (const k of ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'NODE_ENV']) {
    saved[k] = process.env[k];
  }
  Object.assign(process.env, vars);
  return () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
};

test('fresh database gets an admin from ADMIN_EMAIL/ADMIN_PASSWORD', async () => {
  await User.deleteMany({});
  const restore = withAdminCreds({ ADMIN_EMAIL: 'owner@gym.test', ADMIN_PASSWORD: 'GymOwner@123' });
  try {
    const result = await bootstrapAdmin();
    assert.equal(result.status, 'created');
    assert.equal(result.email, 'owner@gym.test');

    const admin = await User.findOne({ email: 'owner@gym.test' }).select('+password');
    assert.equal(admin.role, 'admin');
    assert.notEqual(admin.password, 'GymOwner@123', 'password must be hashed');
  } finally {
    restore();
  }
});

test('bootstrapped admin can log in through the API', async () => {
  const res = await request('POST', '/api/auth/login', { body: { email: 'owner@gym.test', password: 'GymOwner@123' } });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.user.role, 'admin');
});

test('bootstrap is skipped when users already exist', async () => {
  const restore = withAdminCreds({ ADMIN_EMAIL: 'other@gym.test', ADMIN_PASSWORD: 'OtherPass@123' });
  try {
    const result = await bootstrapAdmin();
    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'users-exist');
    const created = await User.exists({ email: 'other@gym.test' });
    assert.equal(created, null, 'must not create a second account');
  } finally {
    restore();
  }
});

test('missing admin credentials on an empty database fail loudly', async () => {
  await User.deleteMany({});
  const restore = withAdminCreds({ ADMIN_EMAIL: '', ADMIN_PASSWORD: '' });
  try {
    await assert.rejects(() => bootstrapAdmin(), /ADMIN_EMAIL/);
  } finally {
    restore();
  }
});

test('weak admin password on an empty database is rejected', async () => {
  await User.deleteMany({});
  const restore = withAdminCreds({ ADMIN_EMAIL: 'owner@gym.test', ADMIN_PASSWORD: 'short1' });
  try {
    await assert.rejects(() => bootstrapAdmin(), /ADMIN_PASSWORD/);
  } finally {
    restore();
  }
});