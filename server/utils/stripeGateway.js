// Thin, testable wrapper around the Stripe SDK.
//
// Secrets are read from the environment at call time (never cached) so tests
// can flip configuration and inject an in-memory client without leaking
// credentials into module state. The Stripe client is created lazily and
// cached per process, mirroring the razorpayGateway wrapper's conventions.

const { stripeConfigured } = require('./paymentConfig');

let client = null;

const getStripe = () => {
  if (client) return client;
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('[stripe] STRIPE_SECRET_KEY is not configured');
  }
  const Stripe = require('stripe');
  client = new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
};

// Test seam: lets the test suite inject an in-memory client so no HTTP call
// ever reaches Stripe with throwaway credentials. Production always builds the
// SDK client from the environment.
const setStripeClient = (fake) => {
  client = fake;
};

const clearStripeClient = () => {
  client = null;
};

// Verify a Stripe webhook signature. The raw body bytes must be passed through
// untouched - re-serializing the JSON breaks verification. Returns the
// constructed event, or null when the webhook secret is not configured.
const verifyWebhookSignature = (rawBody, signature) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return null;
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
};

const createCheckoutSession = async (payload) =>
  getStripe().checkout.sessions.create(payload);

// Optional server-side validation of a session's live state (amount, currency,
// payment status) before completing a payment from a webhook event.
const retrieveSession = async (sessionId) =>
  getStripe().checkout.sessions.retrieve(sessionId);

// Refund a Stripe payment. Amount is in the smallest currency unit (paise for
// INR). The gateway response is returned so the caller records the refund only
// after Stripe confirms it - never before.
const createRefund = async ({ paymentIntent, amount, reason }) =>
  getStripe().refunds.create({ payment_intent: paymentIntent, amount, reason });

module.exports = {
  stripeConfigured,
  getStripe,
  setStripeClient,
  clearStripeClient,
  verifyWebhookSignature,
  createCheckoutSession,
  retrieveSession,
  createRefund
};