'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  isUpiPlaceholder,
  upiConfigured,
  stripeConfigured,
  razorpayConfigured,
  razorpayLiveConfigured,
  razorpayWebhookConfigured,
  hasRealPaymentConfig,
  describePaymentConfig,
  ensureProductionPaymentConfig,
} = require('../utils/paymentConfig');

const withEnv = (vars, fn) => {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
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
    assert.throws(
      () => ensureProductionPaymentConfig(),
      /STRIPE_WEBHOOK_SECRET/,
      'live stripe without a webhook secret must not boot'
    );
  });
  withEnv({ NODE_ENV: 'production', UPI_ID: '', STRIPE_SECRET_KEY: 'sk_live_real', STRIPE_WEBHOOK_SECRET: 'whsec_x' }, () => {
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

test('razorpayConfigured requires a key id AND a key secret', () => {
  withEnv({ RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '' }, () => assert.equal(razorpayConfigured(), false));
  withEnv({ RAZORPAY_KEY_ID: 'rzp_test_abc', RAZORPAY_KEY_SECRET: '' }, () => assert.equal(razorpayConfigured(), false));
  withEnv({ RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: 'secret' }, () => assert.equal(razorpayConfigured(), false));
  withEnv({ RAZORPAY_KEY_ID: 'rzp_test_abc', RAZORPAY_KEY_SECRET: 'secret' }, () => assert.equal(razorpayConfigured(), true));
  withEnv({ RAZORPAY_KEY_ID: '#rzp_test_disabled', RAZORPAY_KEY_SECRET: 'secret' }, () => assert.equal(razorpayConfigured(), false));
});

test('razorpayLiveConfigured distinguishes test keys from live keys', () => {
  withEnv({ RAZORPAY_KEY_ID: 'rzp_test_abc', RAZORPAY_KEY_SECRET: 's' }, () => assert.equal(razorpayLiveConfigured(), false));
  withEnv({ RAZORPAY_KEY_ID: 'rzp_live_abc', RAZORPAY_KEY_SECRET: 's' }, () => assert.equal(razorpayLiveConfigured(), true));
  withEnv({ RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: 's' }, () => assert.equal(razorpayLiveConfigured(), false));
});

test('razorpayWebhookConfigured requires the webhook secret', () => {
  withEnv({ RAZORPAY_WEBHOOK_SECRET: '' }, () => assert.equal(razorpayWebhookConfigured(), false));
  withEnv({ RAZORPAY_WEBHOOK_SECRET: 'whsec_abc' }, () => assert.equal(razorpayWebhookConfigured(), true));
});

test('describePaymentConfig never exposes razorpay credentials and marks modality', () => {
  withEnv({ RAZORPAY_KEY_ID: 'rzp_test_abc', RAZORPAY_KEY_SECRET: 'secret', RAZORPAY_WEBHOOK_SECRET: 'whsec' }, () => {
    const cfg = describePaymentConfig();
    assert.equal(cfg.method, 'razorpay');
    assert.equal(cfg.keyId, 'rzp_test_abc');
    assert.equal(cfg.live, false, 'test keys are not live');
    assert.equal(cfg.webhookConfigured, true);
    assert.equal('RAZORPAY_KEY_SECRET' in cfg, false, 'never expose the key secret');
    assert.equal(JSON.stringify(cfg).includes('secret'), false, 'webhook secret must not leak');
  });
  withEnv({ RAZORPAY_KEY_ID: 'rzp_live_abc', RAZORPAY_KEY_SECRET: 'secret', RAZORPAY_WEBHOOK_SECRET: '' }, () => {
    const cfg = describePaymentConfig();
    assert.equal(cfg.live, true, 'live keys are live');
    assert.equal(cfg.webhookConfigured, false);
  });
});

test('production boot refuses razorpay TEST keys but accepts LIVE keys (no silent demo fallback)', () => {
  withEnv({ NODE_ENV: 'production', RAZORPAY_KEY_ID: 'rzp_test_abc', RAZORPAY_KEY_SECRET: 's', UPI_ID: '', STRIPE_SECRET_KEY: '' }, () => {
    assert.equal(razorpayConfigured(), true, 'test keys configure the gateway for dev');
    assert.throws(() => ensureProductionPaymentConfig(), /real payment configuration/);
  });
  withEnv({ NODE_ENV: 'production', RAZORPAY_KEY_ID: 'rzp_live_abc', RAZORPAY_KEY_SECRET: 's', UPI_ID: '', STRIPE_SECRET_KEY: '' }, () => {
    assert.equal(razorpayLiveConfigured(), true);
    assert.doesNotThrow(() => ensureProductionPaymentConfig());
  });
});

test('production boot refuses missing razorpay credentials', () => {
  withEnv({ NODE_ENV: 'production', RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '', UPI_ID: '', STRIPE_SECRET_KEY: '' }, () => {
    assert.throws(() => ensureProductionPaymentConfig(), /real payment configuration/);
  });
});

test('production boot fails on a mixed setup: rzp_test_* with live stripe', () => {
  withEnv({
    NODE_ENV: 'production',
    RAZORPAY_KEY_ID: 'rzp_test_abc',
    RAZORPAY_KEY_SECRET: 's',
    STRIPE_SECRET_KEY: 'sk_live_abc',
    STRIPE_WEBHOOK_SECRET: 'whsec_x',
    UPI_ID: '',
  }, () => {
    assert.equal(stripeConfigured(), true, 'stripe is live');
    assert.throws(
      () => ensureProductionPaymentConfig(),
      /RAZORPAY_KEY_ID/,
      'a leftover razorpay test key must fail the whole boot even with a live gateway'
    );
  });
});

test('production boot fails on a mixed setup: live razorpay with sk_test_*', () => {
  withEnv({
    NODE_ENV: 'production',
    RAZORPAY_KEY_ID: 'rzp_live_abc',
    RAZORPAY_KEY_SECRET: 's',
    STRIPE_SECRET_KEY: 'sk_test_abc',
    STRIPE_WEBHOOK_SECRET: 'whsec_x',
    UPI_ID: '',
  }, () => {
    assert.equal(razorpayLiveConfigured(), true, 'razorpay is live');
    assert.throws(
      () => ensureProductionPaymentConfig(),
      /STRIPE_SECRET_KEY/,
      'a leftover stripe test key must fail the whole boot even with a live gateway'
    );
  });
});

test('production boot refuses live stripe without a webhook secret', () => {
  withEnv({ NODE_ENV: 'production', STRIPE_SECRET_KEY: 'sk_live_abc', STRIPE_WEBHOOK_SECRET: '', UPI_ID: '' }, () => {
    assert.throws(() => ensureProductionPaymentConfig(), /STRIPE_WEBHOOK_SECRET/);
  });
});

test('production boot accepts live razorpay + live stripe + webhook secret', () => {
  withEnv({
    NODE_ENV: 'production',
    RAZORPAY_KEY_ID: 'rzp_live_abc',
    RAZORPAY_KEY_SECRET: 's',
    STRIPE_SECRET_KEY: 'sk_live_abc',
    STRIPE_WEBHOOK_SECRET: 'whsec_x',
    UPI_ID: '',
  }, () => {
    assert.doesNotThrow(() => ensureProductionPaymentConfig());
  });
});

test('non-production boot keeps test keys working (no NODE_ENV)', () => {
  withEnv({
    NODE_ENV: undefined,
    RAZORPAY_KEY_ID: 'rzp_test_abc',
    RAZORPAY_KEY_SECRET: 's',
    STRIPE_SECRET_KEY: 'sk_test_abc',
    UPI_ID: '',
  }, () => {
    assert.equal(process.env.NODE_ENV, undefined);
    assert.doesNotThrow(() => ensureProductionPaymentConfig());
  });
});

test('non-production boot keeps test keys working (NODE_ENV=test)', () => {
  withEnv({
    NODE_ENV: 'test',
    RAZORPAY_KEY_ID: 'rzp_test_abc',
    RAZORPAY_KEY_SECRET: 's',
    STRIPE_SECRET_KEY: 'sk_test_abc',
    UPI_ID: '',
  }, () => {
    assert.doesNotThrow(() => ensureProductionPaymentConfig());
  });
});