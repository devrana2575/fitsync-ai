'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  isUpiPlaceholder,
  upiConfigured,
  stripeConfigured,
  hasRealPaymentConfig,
  ensureProductionPaymentConfig,
} = require('../utils/paymentConfig');

const withEnv = (vars, fn) => {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

test('UPI placeholders are detected', () => {
  for (const id of ['fitsync@okaxis', 'yourname@oksbi', 'gym@example', 'test@example.com']) {
    assert.equal(isUpiPlaceholder(id), true, `expected placeholder: ${id}`);
  }
  for (const id of ['powergym@okhdfcbank', 'realspace@ybl', 'admin@sbi']) {
    assert.equal(isUpiPlaceholder(id), false, `expected real: ${id}`);
  }
});

test('upiConfigured only accepts real ids', () => {
  withEnv({ UPI_ID: 'fitsync@okaxis' }, () => assert.equal(upiConfigured(), false));
  withEnv({ UPI_ID: 'powergym@okhdfcbank' }, () => assert.equal(upiConfigured(), true));
  withEnv({ UPI_ID: '' }, () => assert.equal(upiConfigured(), false));
  withEnv({ UPI_ID: '#commented-out@ybl' }, () => assert.equal(upiConfigured(), false));
});

test('stripeConfigured requires a live secret key', () => {
  withEnv({ STRIPE_SECRET_KEY: 'sk_test_abc' }, () => assert.equal(stripeConfigured(), false));
  withEnv({ STRIPE_SECRET_KEY: 'sk_live_abc' }, () => assert.equal(stripeConfigured(), true));
  withEnv({ STRIPE_SECRET_KEY: '' }, () => assert.equal(stripeConfigured(), false));
});

test('production boot refuses placeholder / missing payment config', () => {
  withEnv({ NODE_ENV: 'production', UPI_ID: 'fitsync@okaxis', STRIPE_SECRET_KEY: '' }, () => {
    assert.throws(() => ensureProductionPaymentConfig(), /real payment configuration/);
  });
  withEnv({ NODE_ENV: 'production', UPI_ID: '', STRIPE_SECRET_KEY: '' }, () => {
    assert.throws(() => ensureProductionPaymentConfig(), /real payment configuration/);
  });
  withEnv({ NODE_ENV: 'production', UPI_ID: '', STRIPE_SECRET_KEY: 'sk_live_real' }, () => {
    assert.doesNotThrow(() => ensureProductionPaymentConfig());
  });
  withEnv({ NODE_ENV: 'production', UPI_ID: 'powergym@okhdfcbank', STRIPE_SECRET_KEY: '' }, () => {
    assert.doesNotThrow(() => ensureProductionPaymentConfig());
  });
});

test('non-production boot never blocks', () => {
  withEnv({ NODE_ENV: 'test', UPI_ID: '', STRIPE_SECRET_KEY: '' }, () => {
    assert.equal(hasRealPaymentConfig(), false);
    assert.doesNotThrow(() => ensureProductionPaymentConfig());
  });
});