'use strict';
// Integration + unit tests for the hardened Stripe payment flow.
//
// The HTTP-bound Stripe SDK calls are stubbed with an in-memory client so no
// request ever reaches Stripe. The checkout router consumes the stripeGateway
// wrapper lazily, so injecting a fake client is enough to drive both /create
// and the webhook end-to-end. Signature policy mirrors the razorpay suite:
// missing header -> 400, forged signature -> 400, missing webhook secret -> 503.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { setup, teardown, request, registerMember, adminContext, uniqueEmail } = require('./helpers');

// Workaround for a pre-existing, uncommitted Membership.js change (planSnapshot
// migration) that declares BOTH `{ user: 1 }` and a unique partial `{ user: 1 }`
// ACTIVE index. Both auto-name to "user_1", so Model.init() after helpers'
// fresh dropDatabase always fails with Mongo code 86 (IndexKeySpecsConflict).
// Disabling index rebuild lets this suite boot; the conflict is owned by that
// model change and is out of scope here.
mongoose.connection.config.autoIndex = false;

// helpers.js deletes the Stripe env vars at require-time; set them here, before
// setup() boots the app, so the checkout router sees a live-key configuration.
process.env.STRIPE_SECRET_KEY = 'sk_live_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake';

const stripeGateway = require('../utils/stripeGateway');
const Payment = require('../models/Payment');
const Membership = require('../models/Membership');

const VALID_SIGNATURE = 'valid-sig';
const PLAN_PRICE = 1000;
const PLAN_PAISE = 100000;

let baseUrl;
let adminToken;

// Fresh in-memory Stripe client with sane defaults. constructEvent only accepts
// the known signature, mirroring the real SDK's constant-time verification.
let fake;
let lastCreatedSession = null;
let refundCalls = [];
const installFakeGateway = () => {
  lastCreatedSession = null;
  refundCalls = [];
  fake = {
    webhooks: {
      constructEvent: (raw, signature) => {
        if (signature !== VALID_SIGNATURE) {
          const error = new Error('Stripe signature verification failed');
          error.type = 'StripeSignatureVerificationError';
          throw error;
        }
        const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
        return JSON.parse(text);
      }
    },
    checkout: {
      sessions: {
        create: (payload) => {
          lastCreatedSession = payload;
          return Promise.resolve({ id: 'cs_test_1', url: 'https://checkout.stripe.com/x', ...payload });
        }
      }
    },
    refunds: {
      create: (payload) => {
        refundCalls.push(payload);
        return Promise.resolve({ id: 're_fake_1', payment_intent: payload.payment_intent, amount: payload.amount });
      }
    }
  };
  stripeGateway.setStripeClient(fake);
};

const webhookPost = async (event, opts = {}) => {
  const hasSignature = Object.prototype.hasOwnProperty.call(opts, 'signature');
  const signature = hasSignature ? opts.signature : VALID_SIGNATURE;
  const raw = JSON.stringify(event);
  const headers = { 'Content-Type': 'application/json' };
  if (signature !== undefined) headers['stripe-signature'] = signature;
  const res = await fetch(`${baseUrl}/api/checkout/webhook`, {
    method: 'POST',
    headers,
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

// Creates a PENDING stripe payment + PENDING membership through the same
// /api/checkout/create path members use in production (live-key gated).
const createStripePayment = async (memberToken, planId) => {
  const res = await request('POST', '/api/checkout/create', { token: memberToken, body: { planId } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.mode, 'stripe');
  assert.ok(res.body.url, 'redirect url returned');
  return { payment: res.body.payment, membership: res.body.membership };
};

let seqCounter = 0;
const nextId = (prefix) => `${prefix}_${++seqCounter}`;

const metaOf = () => {
  const meta = (lastCreatedSession && lastCreatedSession.metadata) || {};
  return { ...meta };
};

const buildCheckoutEvent = ({ paymentIntent = nextId('pi'), amountTotal = PLAN_PAISE, currency = 'inr' } = {}) => ({
  id: nextId('evt'),
  type: 'checkout.session.completed',
  data: {
    object: {
      id: nextId('cs'),
      payment_intent: paymentIntent,
      amount_total: amountTotal,
      currency,
      client_reference_id: metaOf().paymentId,
      metadata: metaOf()
    }
  }
});

const buildPaymentIntentEvent = ({ id = nextId('pi'), amount = PLAN_PAISE, currency = 'inr' } = {}) => ({
  id: nextId('evt'),
  type: 'payment_intent.succeeded',
  data: {
    object: {
      id,
      amount,
      currency,
      client_reference_id: metaOf().paymentId,
      metadata: metaOf()
    }
  }
});

const buildRefundedEvent = ({ paymentIntent = nextId('pi') } = {}) => ({
  id: nextId('evt'),
  type: 'charge.refunded',
  data: {
    object: {
      id: nextId('ch'),
      payment_intent: paymentIntent,
      balance_transaction: nextId('txn'),
      client_reference_id: metaOf().paymentId,
      metadata: metaOf()
    }
  }
});

before(async () => {
  ({ baseUrl } = await setup());
  ({ token: adminToken } = await adminContext());
  installFakeGateway();
});

after(() => {
  stripeGateway.clearStripeClient();
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  return teardown();
});

// ---------------------------------------------------------------
// A. Checkout session creation
// ---------------------------------------------------------------
test('stripe checkout session is server-priced, INR, and stamps payment metadata', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();

  const { payment } = await createStripePayment(member.token, plan._id);

  const doc = await Payment.findById(payment).select('status gateway gatewayStatus transactionId amount').lean();
  assert.equal(doc.status, 'PENDING', 'payment always starts PENDING');
  assert.equal(doc.gateway, 'stripe', 'stripe payments record gateway=stripe at create time');
  assert.equal(doc.transactionId, 'cs_test_1', 'checkout session id persisted as transactionId');

  assert.ok(lastCreatedSession, 'createCheckoutSession called through the gateway wrapper');
  assert.equal(lastCreatedSession.line_items[0].price_data.currency, 'inr');
  assert.equal(lastCreatedSession.line_items[0].price_data.unit_amount, PLAN_PAISE, 'unit_amount is price*100 in paise');
  assert.equal(lastCreatedSession.metadata.paymentId, String(payment));
  assert.ok(lastCreatedSession.metadata.membershipId);
  assert.ok(lastCreatedSession.metadata.userId);
});

// ---------------------------------------------------------------
// B. Signature policy
// ---------------------------------------------------------------
test('unverified webhook (no stripe-signature header) is rejected and payment stays PENDING', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const { payment } = await createStripePayment(member.token, plan._id);

  const res = await webhookPost(buildCheckoutEvent(), { signature: undefined });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /signature/i);

  assert.equal((await Payment.findById(payment).select('status').lean()).status, 'PENDING');
});

test('invalid signature is rejected, payment stays PENDING, no membership activation', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const { payment } = await createStripePayment(member.token, plan._id);

  const res = await webhookPost(buildCheckoutEvent(), { signature: 'forged-signature' });
  assert.equal(res.status, 400);
  assert.equal(res.body.message, 'Invalid webhook signature');

  assert.equal((await Payment.findById(payment).select('status').lean()).status, 'PENDING');
  assert.equal(await Membership.countDocuments({ user: member.user.id, status: 'ACTIVE' }), 0);
});

test('missing webhook secret returns 503 without processing', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const { payment } = await createStripePayment(member.token, plan._id);

  const saved = process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  try {
    const res = await webhookPost(buildCheckoutEvent());
    assert.equal(res.status, 503);
    assert.equal(res.body.message, 'Webhook is not configured');
  } finally {
    process.env.STRIPE_WEBHOOK_SECRET = saved;
  }

  assert.equal((await Payment.findById(payment).select('status').lean()).status, 'PENDING');
  assert.equal(await Membership.countDocuments({ user: member.user.id, status: 'ACTIVE' }), 0);
});

// ---------------------------------------------------------------
// C. Completion through the guarded lifecycle
// ---------------------------------------------------------------
test('valid signed checkout.session.completed completes the payment and activates membership', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const { payment, membership } = await createStripePayment(member.token, plan._id);

  const event = buildCheckoutEvent({ paymentIntent: nextId('pi') });
  const res = await webhookPost(event);
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const doc = await Payment.findById(payment).select(
    'status gateway gatewayPaymentId gatewayStatus gatewayEventId gatewayVerifiedAt confirmedBy'
  ).lean();
  assert.equal(doc.status, 'COMPLETED');
  assert.equal(doc.gateway, 'stripe');
  assert.equal(doc.gatewayPaymentId, event.data.object.payment_intent);
  assert.equal(doc.gatewayStatus, 'completed');
  assert.equal(doc.gatewayEventId, event.id);
  assert.ok(doc.gatewayVerifiedAt, 'gateway verification timestamp recorded');
  assert.equal(doc.confirmedBy, undefined, 'gateway completions have no admin confirmor');

  const act = await Membership.findById(membership).select('status').lean();
  assert.equal(act.status, 'ACTIVE', 'webhook completion activates the membership');
});

test('re-delivered checkout.session.completed stays idempotent - exactly one ACTIVE membership', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const { payment } = await createStripePayment(member.token, plan._id);

  const event = buildCheckoutEvent({ paymentIntent: nextId('pi') });
  const first = await webhookPost(event);
  const second = await webhookPost(event);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  assert.equal((await Payment.findById(payment).select('status').lean()).status, 'COMPLETED');
  assert.equal(await Payment.countDocuments({ _id: payment }), 1, 'single payment record');
  assert.equal(await Membership.countDocuments({ user: member.user.id, status: 'ACTIVE' }), 1);
});

test('valid signature but wrong amount is acknowledged without completing', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const { payment } = await createStripePayment(member.token, plan._id);

  const res = await webhookPost(buildCheckoutEvent({ amountTotal: PLAN_PAISE + 1 }));
  assert.equal(res.status, 200, 'acknowledged so Stripe does not retry');

  assert.equal((await Payment.findById(payment).select('status').lean()).status, 'PENDING', 'amount mismatch keeps payment pending');
  assert.equal(await Membership.countDocuments({ user: member.user.id, status: 'ACTIVE' }), 0);
});

test('payment_intent.succeeded completes a pending stripe payment', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const { payment, membership } = await createStripePayment(member.token, plan._id);

  const event = buildPaymentIntentEvent({ id: nextId('pi') });
  const res = await webhookPost(event);
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const doc = await Payment.findById(payment).select('status gatewayPaymentId gatewayStatus').lean();
  assert.equal(doc.status, 'COMPLETED');
  assert.equal(doc.gatewayPaymentId, event.data.object.id);
  assert.equal(doc.gatewayStatus, 'succeeded');
  assert.equal((await Membership.findById(membership).select('status').lean()).status, 'ACTIVE');
});

test('charge.refunded marks the payment REFUNDED and cancels the linked membership', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const { payment, membership } = await createStripePayment(member.token, plan._id);

  const completed = buildCheckoutEvent({ paymentIntent: nextId('pi') });
  assert.equal((await webhookPost(completed)).status, 200);
  assert.equal((await Payment.findById(payment).select('status').lean()).status, 'COMPLETED');

  const res = await webhookPost(buildRefundedEvent({ paymentIntent: completed.data.object.payment_intent }));
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const doc = await Payment.findById(payment).select('status gatewayStatus notes').lean();
  assert.equal(doc.status, 'REFUNDED');
  assert.equal(doc.gatewayStatus, 'refunded');
  assert.match(doc.notes, /Stripe refund/);
  assert.equal((await Membership.findById(membership).select('status').lean()).status, 'CANCELLED');
});

// ---------------------------------------------------------------
// D. Admin refund requires Stripe confirmation first
// ---------------------------------------------------------------
test('admin stripe refund: gateway rejection keeps payment COMPLETED; gateway success refunds and cancels', async () => {
  installFakeGateway();
  const member = await registerMember();
  const plan = await createPlan();
  const { payment, membership } = await createStripePayment(member.token, plan._id);

  const completed = buildCheckoutEvent({ paymentIntent: nextId('pi') });
  assert.equal((await webhookPost(completed)).status, 200);
  assert.equal((await Payment.findById(payment).select('status').lean()).status, 'COMPLETED');

  fake.refunds.create = () => Promise.reject(new Error('no_stripe_balance'));
  const refused = await request('PUT', `/api/payments/${payment}`, {
    token: adminToken,
    body: { status: 'REFUNDED' }
  });
  assert.equal(refused.status, 502);
  assert.match(refused.body.message, /Stripe/);
  const afterReject = await Payment.findById(payment).select('status').lean();
  assert.equal(afterReject.status, 'COMPLETED', 'refund must not be claimed without Stripe confirmation');
  assert.equal((await Membership.findById(membership).select('status').lean()).status, 'ACTIVE');

  fake.refunds.create = (payload) => {
    refundCalls.push(payload);
    return Promise.resolve({ id: 're_fake_1', payment_intent: payload.payment_intent, amount: payload.amount });
  };
  const ok = await request('PUT', `/api/payments/${payment}`, {
    token: adminToken,
    body: { status: 'REFUNDED' }
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const doc = await Payment.findById(payment).select('status gatewayStatus notes').lean();
  assert.equal(doc.status, 'REFUNDED');
  assert.equal(doc.gatewayStatus, 'refunded');
  assert.match(doc.notes, /Stripe refund re_fake_1/);
  assert.equal(refundCalls.length, 1, 'refund requested with payment_intent and amount in paise');
  assert.equal(refundCalls[0].payment_intent, completed.data.object.payment_intent);
  assert.equal(refundCalls[0].amount, PLAN_PAISE);
  assert.equal(refundCalls[0].reason, 'admin refund');
  assert.equal((await Membership.findById(membership).select('status').lean()).status, 'CANCELLED');
});

// ---------------------------------------------------------------
// E. Non-stripe webhook events are acknowledged safely
// ---------------------------------------------------------------
test('unrelated stripe events are acknowledged without state changes', async () => {
  installFakeGateway();
  const res = await webhookPost({
    id: nextId('evt'),
    type: 'payment_method.attached',
    data: { object: { id: nextId('pm') } }
  });
  assert.equal(res.status, 200);
});