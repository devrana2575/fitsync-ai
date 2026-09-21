// Thin, testable wrapper around the Razorpay SDK.
//
// Secrets are read from the environment at call time (never cached) so tests
// can flip configuration and stub the HTTP-bound methods without leaking
// credentials into module state. All signature checks are constant-time.

const crypto = require('crypto');
const {
  getRazorpayKeyId,
  getRazorpayKeySecret,
  getRazorpayWebhookSecret
} = require('./paymentConfig');

let client = null;

const getRazorpay = () => {
  if (client) return client;
  if (!getRazorpayKeyId() || !getRazorpayKeySecret()) {
    throw new Error('[razorpay] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not configured');
  }
  const Razorpay = require('razorpay');
  client = new Razorpay({
    key_id: getRazorpayKeyId(),
    key_secret: getRazorpayKeySecret()
  });
  return client;
};

// Test seam: lets the test suite inject an in-memory client so no HTTP call
// ever reaches Razorpay with throwaway credentials. Production always builds
// the SDK client from the environment.
const setRazorpayClient = (fake) => {
  client = fake;
};

const clearRazorpayClient = () => {
  client = null;
};

// INR -> minor units (paise). Integer-only conversion; never float arithmetic
// at the boundary of a gateway amount. Example: ₹999 -> 99900 paise.
const toPaise = (inr) => Math.round(Number(inr) * 100);

const createOrder = async ({ amount, currency = 'INR', receipt, notes = {} }) =>
  getRazorpay().orders.create({ amount, currency, receipt, notes });

const fetchOrder = async (orderId) => getRazorpay().orders.fetch(orderId);

const fetchPayment = async (paymentId) => getRazorpay().payments.fetch(paymentId);

// Refund a captured Razorpay payment. The gateway response is returned so the
// caller can record the refund id only after Razorpay confirms it.
const createRefund = async (paymentId, { amount, notes } = {}) =>
  getRazorpay().payments.refund(paymentId, { amount, notes });

const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

// HMAC_SHA256(orderId|paymentId, key_secret) base64. This is the signature
// Razorpay Checkout hands back to the callback - it proves the checkout result
// was produced by Razorpay for exactly this order+payment pair.
const verifyPaymentSignature = ({ orderId, paymentId, signature }) => {
  if (!orderId || !paymentId || !signature || !getRazorpayKeySecret()) return false;
  const expected = crypto
    .createHmac('sha256', getRazorpayKeySecret())
    .update(`${orderId}|${paymentId}`)
    .digest('base64');
  return safeEqual(expected, signature);
};

// HMAC_SHA256(rawRequestBody, webhook_secret) base64. The raw bytes are hashed
// verbatim - the body must not be re-serialized before verification.
const verifyWebhookSignature = ({ body, signature }) => {
  if (!body || !signature || !getRazorpayWebhookSecret()) return false;
  const expected = crypto
    .createHmac('sha256', getRazorpayWebhookSecret())
    .update(Buffer.isBuffer(body) ? body : String(body))
    .digest('base64');
  return safeEqual(expected, signature);
};

module.exports = {
  toPaise,
  createOrder,
  fetchOrder,
  fetchPayment,
  createRefund,
  verifyPaymentSignature,
  verifyWebhookSignature,
  setRazorpayClient,
  clearRazorpayClient
};