'use strict';
// Integration + unit tests for the real Razorpay online payment flow.
//
// The HTTP-bound Razorpay SDK calls are stubbed with an in-memory gateway so
// no request ever reaches Razorpay. Signature and webhook HMAC checks run
// against the real crypto implementation with known test secrets.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { setup, teardown, request, registerMember, adminContext, uniqueEmail } = require('./helpers');
const razorpayGateway = require('../utils/razorpayGateway');
const Payment = require('../models/Payment');
const Membership = require('../models/Membership');

const KEY_SECRET = 'test_key_secret';
const WEBHOOK_SECRET = 'test_webhook_secret';
const PLAN_PRICE = 1000;
const PLAN_PAISE = 100000;

let baseUrl;
let adminToken;

const sign = (orderId, paymentId) =>
  crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('base64');

const webhookSign = (raw) =>
  crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('base64');

// Fresh in-memory gateway with sane defaults; tests can override specific
// methods to simulate wrong amounts, uncaptured payments, refunds, etc.
// Order ids are unique per fake instance so the unique gatewayOrderId index is
// respected across tests sharing the database.
let fake;
let createdOrderPayloads = [];
let orderSeq = 0;
let lastOrderId = '';
const installFakeGateway = () => {
  createdOrderPayloads = [];
  lastOrderId = '';
  fake = {
    orders: {
      create: (payload) => {
        lastOrderId = `order_test_${++orderSeq}`;
        createdOrderPayloads.push(payload);
        return Promise.resolve({ id: lastOrderId, ...payload });
      },
      fetch: (orderId) => Promise.resolve({ id: orderId, amount: PLAN_PAISE, currency: 'INR' })
    },
    payments: {
      fetch: (paymentId) => Promise.resolve({
        id: paymentId,
        order_id: lastOrderId,
        status: 'captured',
        amount: PLAN_PAISE,
        currency: 'INR'
      }),
      refund: (paymentId, opts) => Promise.resolve({ id: 'refund_test_1', ...opts })
    }
  };
  razorpayGateway.setRazorpayClient(fake);
};

const webhookPost = async (event, { signature } = {}) => {
  const raw = JSON.stringify(event);
  const res = await fetch(`${baseUrl}/api/payments/razorpay/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': signature || webhookSign(raw)
    },
    body: raw
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON response */ }
  return { status: res.status, body: data };
};

let planCounter = 0;
const uniquePlanName = (base) => `${base} ${++planCounter} (${Date.now()} ${Math.random().toString(36).slice(2, 6)})`;

const createPlan = async (over = {}) => {
  const res = await request('POST', '/api/membership-plans', {
    token: adminToken,
    body: {
      name: uniquePlanName('Monthly'),
      price: PLAN_PRICE,
      duration: 30,
      description: '30 day plan, 1000 INR',
      ...over
    }
  });
  assert.equal(res.status, 201, res.body && res.body.message);
  return res.body.plan;
};

const createRazorpayOrder = async (memberToken, planId, extraBody = {}) =>
  request('POST', '/api/checkout/razorpay/order', { token: memberToken, body: { planId, ...extraBody } });

before(async () => {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_fitsync';
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  ({ baseUrl } = await setup());
  ({ token: adminToken } = await adminContext());
  installFakeGateway();
});

after(() => {
  razorpayGateway.clearRazorpayClient();
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  return teardown();
});

// ---------------------------------------------------------------
// A. Signature verification (real HMAC, known secrets)
// ---------------------------------------------------------------
test('signature verification accepts a valid signature', () => {
  const sig = sign('order_valid', 'pay_valid');
  assert.equal(
    razorpayGateway.verifyPaymentSignature({ orderId: 'order_valid', paymentId: 'pay_valid', signature: sig }),
    true
  );
});

test('signature verification rejects invalid / malformed signatures', () => {
  const sig = sign('order_valid', 'pay_valid');
  assert.equal(
    razorpayGateway.verifyPaymentSignature({ orderId: 'order_valid', paymentId: 'pay_valid', signature: sig.toUpperCase() }),
    false,
    'tampered base64 must fail'
  );
  assert.equal(
    razorpayGateway.verifyPaymentSignature({ orderId: 'order_valid', paymentId: 'pay_valid', signature: 'gg' }),
    false,
    'garbage signature must fail'
  );
  assert.equal(
    razorpayGateway.verifyPaymentSignature({ orderId: 'order_valid', paymentId: 'pay_valid', signature: '' }),
    false
  );
  assert.equal(
    razorpayGateway.verifyPaymentSignature({ orderId: 'order_valid', paymentId: 'pay_valid', signature: null }),
    false
  );
});

test('signature verification rejects the wrong order id', () => {
  const sig = sign('order_actual', 'pay_valid');
  assert.equal(
    razorpayGateway.verifyPaymentSignature({ orderId: 'order_other', paymentId: 'pay_valid', signature: sig }),
    false
  );
});

test('signature verification rejects the wrong payment id', () => {
  const sig = sign('order_valid', 'pay_actual');
  assert.equal(
    razorpayGateway.verifyPaymentSignature({ orderId: 'order_valid', paymentId: 'pay_other', signature: sig }),
    false
  );
});

test('signature verification fails when the key secret is unset', () => {
  const saved = process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_KEY_SECRET;
  try {
    assert.equal(
      razorpayGateway.verifyPaymentSignature({ orderId: 'order_valid', paymentId: 'pay_valid', signature: sign('order_valid', 'pay_valid') }),
      false
    );
  } finally {
    process.env.RAZORPAY_KEY_SECRET = saved;
  }
});

// ---------------------------------------------------------------
// B. Order creation
// ---------------------------------------------------------------
test('razorpay order creation: valid member+plan returns a server-priced order', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();

  const res = await createRazorpayOrder(member.token, plan._id);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.mode, 'razorpay');
  assert.equal(res.body.keyId, 'rzp_test_fitsync');
  assert.ok(res.body.orderId, 'returns the gateway order id');
  assert.equal(res.body.amount, PLAN_PAISE, 'amount is in minor units (paise)');
  assert.equal(res.body.currency, 'INR');
  assert.equal(res.body.amount, razorpayGateway.toPaise(plan.price));

  assert.equal(createdOrderPayloads.length, 1);
  assert.equal(createdOrderPayloads[0].amount, PLAN_PAISE, 'order amount comes from the database plan price');
  assert.equal(createdOrderPayloads[0].currency, 'INR');
  assert.ok(typeof createdOrderPayloads[0].receipt === 'string');

  const payment = await Payment.findById(res.body.payment).select('status gateway gatewayOrderId amount').lean();
  assert.equal(payment.status, 'PENDING', 'payment is created PENDING');
  assert.equal(payment.gateway, 'razorpay');
  assert.equal(payment.gatewayOrderId, res.body.orderId);
  assert.equal(payment.amount, PLAN_PRICE);
});

test('razorpay order amount is always taken from the database, never the frontend', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();

  const res = await createRazorpayOrder(member.token, plan._id, { amount: 1, price: 0.5, orderAmount: 123 });
  assert.equal(res.status, 201);
  assert.equal(createdOrderPayloads[0].amount, PLAN_PAISE, 'frontend-supplied amounts must be ignored');
  assert.equal(res.body.amount, PLAN_PAISE);
});

test('razorpay order creation rejects an unknown plan', async () => {
  installFakeGateway();
  const member = await registerMember();
  const res = await createRazorpayOrder(member.token, '000000000000000000000000');
  assert.equal(res.status, 404);
});

test('razorpay order endpoint requires a plan id', async () => {
  installFakeGateway();
  const member = await registerMember();
  const res = await createRazorpayOrder(member.token, undefined);
  assert.equal(res.status, 400);
});

test('razorpay order creation rejects unauthorized users', async () => {
  installFakeGateway();
  const trainer = await (async () => {
    const User = require('../models/User');
    const user = await User.create({ name: 'T', email: uniqueEmail('trainer'), password: 'Trainer@123', role: 'trainer' });
    const login = await request('POST', '/api/auth/login', { body: { email: user.email, password: 'Trainer@123' } });
    return login.body.token;
  })();
  const plan = await createPlan();

  const unauthNoToken = await createRazorpayOrder(undefined, plan._id);
  assert.equal(unauthNoToken.status, 401);

  const forbiddenRole = await createRazorpayOrder(trainer, plan._id);
  assert.equal(forbiddenRole.status, 403, 'trainer is not a member');
});

test('duplicate razorpay order requests reuse the same order and payment', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();

  const first = await createRazorpayOrder(member.token, plan._id);
  const second = await createRazorpayOrder(member.token, plan._id);

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(first.body.orderId, second.body.orderId, 'identical checkout reuses the same gateway order');
  assert.equal(first.body.payment, second.body.payment, 'identical checkout reuses the same payment');
  assert.equal(createdOrderPayloads.length, 1, 'only one upstream order was ever created');
});

// ---------------------------------------------------------------
// C. Payment verification
// ---------------------------------------------------------------
test('valid razorpay payment becomes COMPLETED and activates the membership', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const orderResp = await createRazorpayOrder(member.token, plan._id);
  const orderId = orderResp.body.orderId;
  const paymentId = 'pay_valid_1';
  const signature = sign(orderId, paymentId);

  const verify = await request('POST', '/api/checkout/razorpay/verify', {
    token: member.token,
    body: { razorpay_payment_id: paymentId, razorpay_order_id: orderId, razorpay_signature: signature }
  });
  assert.equal(verify.status, 200, JSON.stringify(verify.body));
  assert.equal(verify.body.payment.status, 'COMPLETED');

  const payment = await Payment.findById(orderResp.body.payment).select('status confirmedBy confirmedAt gatewayVerifiedAt gatewayPaymentId gatewaySignature').lean();
  assert.equal(payment.status, 'COMPLETED');
  assert.equal(payment.gatewayPaymentId, paymentId);
  assert.ok(payment.gatewayVerifiedAt, 'gateway verification timestamp recorded');
  assert.equal(payment.confirmedBy, undefined, 'gateway completions have no admin confirmor');

  const active = await request('GET', `/api/memberships/active/${member.user.id}`, { token: adminToken });
  assert.equal(active.body.membership.status, 'ACTIVE', 'verified payment activates membership');
});

test('verify rejects a wrong gateway amount', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const orderResp = await createRazorpayOrder(member.token, plan._id);
  const orderId = orderResp.body.orderId;
  const paymentId = 'pay_wrong_amount';

  fake.payments.fetch = () => Promise.resolve({ id: paymentId, order_id: orderId, status: 'captured', amount: PLAN_PAISE - 5000, currency: 'INR' });

  const verify = await request('POST', '/api/checkout/razorpay/verify', {
    token: member.token,
    body: { razorpay_payment_id: paymentId, razorpay_order_id: orderId, razorpay_signature: sign(orderId, paymentId) }
  });
  assert.equal(verify.status, 400);

  const payment = await Payment.findById(orderResp.body.payment).select('status').lean();
  assert.equal(payment.status, 'PENDING', 'wrong amount must not complete the payment');
  const active = await request('GET', `/api/memberships/active/${member.user.id}`, { token: adminToken });
  assert.equal(active.body.membership, null, 'membership must NOT activate on an amount mismatch');
});

test('verify rejects a wrong currency', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const orderResp = await createRazorpayOrder(member.token, plan._id);
  const orderId = orderResp.body.orderId;
  const paymentId = 'pay_wrong_currency';

  fake.payments.fetch = () => Promise.resolve({ id: paymentId, order_id: orderId, status: 'captured', amount: PLAN_PAISE, currency: 'USD' });

  const verify = await request('POST', '/api/checkout/razorpay/verify', {
    token: member.token,
    body: { razorpay_payment_id: paymentId, razorpay_order_id: orderId, razorpay_signature: sign(orderId, paymentId) }
  });
  assert.equal(verify.status, 400);
  assert.equal((await Payment.findById(orderResp.body.payment).select('status').lean()).status, 'PENDING');
});

test('verify does NOT activate a membership when the payment is not captured', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const orderResp = await createRazorpayOrder(member.token, plan._id);
  const orderId = orderResp.body.orderId;
  const paymentId = 'pay_not_captured';

  fake.payments.fetch = () => Promise.resolve({ id: paymentId, order_id: orderId, status: 'authorized', amount: PLAN_PAISE, currency: 'INR' });

  const verify = await request('POST', '/api/checkout/razorpay/verify', {
    token: member.token,
    body: { razorpay_payment_id: paymentId, razorpay_order_id: orderId, razorpay_signature: sign(orderId, paymentId) }
  });
  assert.equal(verify.status, 202, 'not-yet-captured stays pending for reconciliation');
  const payment = await Payment.findById(orderResp.body.payment).select('status').lean();
  assert.equal(payment.status, 'PENDING', 'authorized-but-not-captured must not complete');
  const active = await request('GET', `/api/memberships/active/${member.user.id}`, { token: adminToken });
  assert.equal(active.body.membership, null);
});

test('verify marks a gateway-failed payment FAILED without activating', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const orderResp = await createRazorpayOrder(member.token, plan._id);
  const orderId = orderResp.body.orderId;
  const paymentId = 'pay_failed';

  fake.payments.fetch = () => Promise.resolve({ id: paymentId, order_id: orderId, status: 'failed', amount: PLAN_PAISE, currency: 'INR' });

  const verify = await request('POST', '/api/checkout/razorpay/verify', {
    token: member.token,
    body: { razorpay_payment_id: paymentId, razorpay_order_id: orderId, razorpay_signature: sign(orderId, paymentId) }
  });
  assert.equal(verify.status, 400);
  const payment = await Payment.findById(orderResp.body.payment).select('status').lean();
  assert.equal(payment.status, 'FAILED');
  const active = await request('GET', `/api/memberships/active/${member.user.id}`, { token: adminToken });
  assert.equal(active.body.membership, null);
});

test('verify rejects an invalid signature', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const orderResp = await createRazorpayOrder(member.token, plan._id);
  const orderId = orderResp.body.orderId;

  const verify = await request('POST', '/api/checkout/razorpay/verify', {
    token: member.token,
    body: { razorpay_payment_id: 'pay_bad_sig', razorpay_order_id: orderId, razorpay_signature: 'forged-signature' }
  });
  assert.equal(verify.status, 400);
  assert.match(verify.body.message, /signature/i);
  assert.equal((await Payment.findById(orderResp.body.payment).select('status').lean()).status, 'PENDING');
});

test('verify rejects another member trying to complete someone elses order', async () => {
  installFakeGateway();
  const owner = await registerMember();
  const intruder = await registerMember();
  const plan = await createPlan();
  const orderResp = await createRazorpayOrder(owner.token, plan._id);
  const orderId = orderResp.body.orderId;
  const paymentId = 'pay_owned';

  const verify = await request('POST', '/api/checkout/razorpay/verify', {
    token: intruder.token,
    body: { razorpay_payment_id: paymentId, razorpay_order_id: orderId, razorpay_signature: sign(orderId, paymentId) }
  });
  assert.equal(verify.status, 403);
  assert.equal((await Payment.findById(orderResp.body.payment).select('status').lean()).status, 'PENDING');
});

test('verify is idempotent for an already-completed payment', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const orderResp = await createRazorpayOrder(member.token, plan._id);
  const orderId = orderResp.body.orderId;
  const paymentId = 'pay_idem';
  const payload = { razorpay_payment_id: paymentId, razorpay_order_id: orderId, razorpay_signature: sign(orderId, paymentId) };

  const first = await request('POST', '/api/checkout/razorpay/verify', { token: member.token, body: payload });
  assert.equal(first.status, 200);
  assert.equal(first.body.payment.status, 'COMPLETED');

  const again = await request('POST', '/api/checkout/razorpay/verify', { token: member.token, body: payload });
  assert.equal(again.status, 200);
  assert.match(again.body.message, /already completed/i);
  assert.equal(again.body.payment.status, 'COMPLETED');

  const activeCount = await Membership.countDocuments({ user: member.user.id, status: 'ACTIVE' });
  assert.equal(activeCount, 1, 'no duplicate membership activation on repeat verification');
});

test('verify does not overwrite FAILED/REFUNDED terminal states', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const orderResp = await createRazorpayOrder(member.token, plan._id);
  const orderId = orderResp.body.orderId;

  await Payment.updateOne({ _id: orderResp.body.payment }, { $set: { status: 'REFUNDED' } });

  const verify = await request('POST', '/api/checkout/razorpay/verify', {
    token: member.token,
    body: { razorpay_payment_id: 'pay_refunded_x', razorpay_order_id: orderId, razorpay_signature: sign(orderId, 'pay_refunded_x') }
  });
  assert.equal(verify.status, 400);
  assert.match(verify.body.message, /refunded/i);
  assert.equal((await Payment.findById(orderResp.body.payment).select('status').lean()).status, 'REFUNDED');
});

// ---------------------------------------------------------------
// D. Webhook
// ---------------------------------------------------------------
test('webhook with a valid signature completes the payment and activates membership', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const orderResp = await createRazorpayOrder(member.token, plan._id);
  const orderId = orderResp.body.orderId;

  const event = {
    entity: 'event',
    event: 'payment.captured',
    id: 'evt_captured_1',
    payload: {
      payment: { entity: { id: 'pay_w_captured', order_id: orderId, amount: PLAN_PAISE, currency: 'INR', status: 'captured' } }
    }
  };

  const res = await webhookPost(event);
  assert.equal(res.status, 200);

  const payment = await Payment.findById(orderResp.body.payment).select('status gatewayPaymentId gatewayEventId gatewayVerifiedAt').lean();
  assert.equal(payment.status, 'COMPLETED');
  assert.equal(payment.gatewayPaymentId, 'pay_w_captured');
  assert.equal(payment.gatewayEventId, 'evt_captured_1');
  assert.ok(payment.gatewayVerifiedAt);

  const active = await request('GET', `/api/memberships/active/${member.user.id}`, { token: adminToken });
  assert.equal(active.body.membership.status, 'ACTIVE');
});

test('duplicate webhook delivery does not create a second activation', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const orderResp = await createRazorpayOrder(member.token, plan._id);
  const orderId = orderResp.body.orderId;

  const event = {
    entity: 'event',
    event: 'payment.captured',
    id: 'evt_dup_1',
    payload: {
      payment: { entity: { id: 'pay_w_dup', order_id: orderId, amount: PLAN_PAISE, currency: 'INR', status: 'captured' } }
    }
  };

  const first = await webhookPost(event);
  const second = await webhookPost(event);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  const payment = await Payment.findById(orderResp.body.payment).select('status gatewayEventId').lean();
  assert.equal(payment.status, 'COMPLETED');

  const activeCount = await Membership.countDocuments({ user: member.user.id, status: 'ACTIVE' });
  assert.equal(activeCount, 1, 'exactly one active membership after duplicate delivery');
  assert.equal(await Payment.countDocuments({ _id: orderResp.body.payment }), 1, 'single payment record');
});

test('webhook rejects an invalid signature without touching state', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const orderResp = await createRazorpayOrder(member.token, plan._id);
  const orderId = orderResp.body.orderId;

  const event = {
    entity: 'event',
    event: 'payment.captured',
    id: 'evt_bad_sig',
    payload: { payment: { entity: { id: 'pay_bad', order_id: orderId, amount: PLAN_PAISE, currency: 'INR', status: 'captured' } } }
  };

  const res = await webhookPost(event, { signature: 'forged-signature' });
  assert.equal(res.status, 400);
  assert.equal((await Payment.findById(orderResp.body.payment).select('status').lean()).status, 'PENDING');
  assert.equal((await Membership.countDocuments({ user: member.user.id, status: 'ACTIVE' })), 0);
});

test('webhook marks a failed payment FAILED without activating', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const orderResp = await createRazorpayOrder(member.token, plan._id);
  const orderId = orderResp.body.orderId;

  const event = {
    entity: 'event',
    event: 'payment.failed',
    id: 'evt_failed_1',
    payload: { payment: { entity: { id: 'pay_w_failed', order_id: orderId, amount: PLAN_PAISE, currency: 'INR', status: 'failed' } } }
  };

  const res = await webhookPost(event);
  assert.equal(res.status, 200);
  const payment = await Payment.findById(orderResp.body.payment).select('status').lean();
  assert.equal(payment.status, 'FAILED');
  assert.equal((await Membership.countDocuments({ user: member.user.id, status: 'ACTIVE' })), 0);
});

test('webhook for an unknown order is acknowledged safely', async () => {
  installFakeGateway();
  const event = {
    entity: 'event',
    event: 'payment.captured',
    id: 'evt_unknown_1',
    payload: { payment: { entity: { id: 'pay_unknown', order_id: 'order_does_not_exist', amount: PLAN_PAISE, currency: 'INR', status: 'captured' } } }
  };
  const res = await webhookPost(event);
  assert.equal(res.status, 200);
});

test('webhook with a mismatched amount does not activate a membership', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const orderResp = await createRazorpayOrder(member.token, plan._id);
  const orderId = orderResp.body.orderId;

  const event = {
    entity: 'event',
    event: 'payment.captured',
    id: 'evt_mismatch_1',
    payload: { payment: { entity: { id: 'pay_w_mismatch', order_id: orderId, amount: PLAN_PAISE - 1, currency: 'INR', status: 'captured' } } }
  };

  const res = await webhookPost(event);
  assert.equal(res.status, 200);
  assert.equal((await Payment.findById(orderResp.body.payment).select('status').lean()).status, 'PENDING', 'amount mismatch keeps the payment pending');
  assert.equal((await Membership.countDocuments({ user: member.user.id, status: 'ACTIVE' })), 0);
});

test('webhook refund event revokes an active membership', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const orderResp = await createRazorpayOrder(member.token, plan._id);
  const orderId = orderResp.body.orderId;
  const membershipId = orderResp.body.membership;

  const captured = {
    entity: 'event',
    event: 'payment.captured',
    id: 'evt_ref1_cap',
    payload: { payment: { entity: { id: 'pay_ref1', order_id: orderId, amount: PLAN_PAISE, currency: 'INR', status: 'captured' } } }
  };
  assert.equal((await webhookPost(captured)).status, 200);

  const refundedEvent = {
    entity: 'event',
    event: 'payment.refunded',
    id: 'evt_ref1',
    payload: { payment: { entity: { id: 'pay_ref1', order_id: orderId } } }
  };
  const res = await webhookPost(refundedEvent);
  assert.equal(res.status, 200);

  const payment = await Payment.findById(orderResp.body.payment).select('status').lean();
  assert.equal(payment.status, 'REFUNDED');
  const membership = await Membership.findById(membershipId).select('status').lean();
  assert.equal(membership.status, 'CANCELLED', 'refunded payment revokes active access');
});

// ---------------------------------------------------------------
// E. Manual payments still work alongside the online gateway
// ---------------------------------------------------------------
test('member cannot admin-verify their own razorpay payment', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const orderResp = await createRazorpayOrder(member.token, plan._id);

  const verify = await request('POST', `/api/payments/${orderResp.body.payment}/verify`, { token: member.token });
  assert.equal(verify.status, 403, 'only admins can manually verify payments');
  assert.equal((await Payment.findById(orderResp.body.payment).select('status').lean()).status, 'PENDING');
});

test('manual cash payment still completes and activates via the shared activation path', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();

  const pay = await request('POST', '/api/payments', {
    token: adminToken,
    body: { userId: member.user.id, planId: plan._id, amount: PLAN_PRICE, method: 'cash', status: 'COMPLETED' }
  });
  assert.equal(pay.status, 201);
  assert.equal(pay.body.payment.status, 'COMPLETED');
  assert.ok(pay.body.payment.confirmedBy, 'admin-completed payment records the confirmor');

  const active = await request('GET', `/api/memberships/active/${member.user.id}`, { token: adminToken });
  assert.equal(active.body.membership.status, 'ACTIVE', 'offline manual payment uses the same activation helper');

  const checkin = await request('POST', '/api/attendance/qr-checkin', { token: member.token });
  assert.equal(checkin.status, 201, 'active member can check in');
});

test('member cannot self-confirm a razorpay payment via the legacy confirm endpoint', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const orderResp = await createRazorpayOrder(member.token, plan._id);

  const confirm = await request('POST', `/api/checkout/confirm/${orderResp.body.payment}`, { token: member.token });
  assert.equal(confirm.status, 400);
  assert.match(confirm.body.message, /gateway/i);
  assert.equal((await Payment.findById(orderResp.body.payment).select('status').lean()).status, 'PENDING');
});

test('admin gateway refund requires Razorpay confirmation before marking REFUNDED', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const orderResp = await createRazorpayOrder(member.token, plan._id);
  const orderId = orderResp.body.orderId;
  const paymentId = 'pay_refund_admin';
  const membershipId = orderResp.body.membership;

  // complete the payment through verify so it can be refunded
  await request('POST', '/api/checkout/razorpay/verify', {
    token: member.token,
    body: { razorpay_payment_id: paymentId, razorpay_order_id: orderId, razorpay_signature: sign(orderId, paymentId) }
  });

  // gateway refuses the refund -> the local status must NOT change
  fake.payments.refund = () => Promise.reject(new Error('insufficient balance'));
  const refused = await request('PUT', `/api/payments/${orderResp.body.payment}`, {
    token: adminToken,
    body: { status: 'REFUNDED' }
  });
  assert.equal(refused.status, 502);
  assert.equal((await Payment.findById(orderResp.body.payment).select('status').lean()).status, 'COMPLETED', 'refund must not be claimed without gateway confirmation');
  assert.equal((await Membership.findById(membershipId).select('status').lean()).status, 'ACTIVE');

  // gateway confirms -> refund recorded and membership cancelled
  fake.payments.refund = (pid, opts) => Promise.resolve({ id: 'refund_admin_1', ...opts });
  const ok = await request('PUT', `/api/payments/${orderResp.body.payment}`, {
    token: adminToken,
    body: { status: 'REFUNDED' }
  });
  assert.equal(ok.status, 200);
  const payment = await Payment.findById(orderResp.body.payment).select('status gatewayStatus notes').lean();
  assert.equal(payment.status, 'REFUNDED');
  assert.equal(payment.gatewayStatus, 'refunded');
  assert.match(payment.notes, /Razorpay refund refund_admin_1/);
  assert.equal((await Membership.findById(membershipId).select('status').lean()).status, 'CANCELLED');
});