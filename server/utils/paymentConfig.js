// Shared payment configuration logic.
//
// A real payment setup is required in production. The checkout flow must
// NEVER silently mark a payment COMPLETED without a legitimate confirmation
// mechanism. UPI QR generation is a payee address convenience, not
// verification - member confirmations keep payments PENDING until an
// authorized admin verifies the transfer.

const UPI_PLACEHOLDER_PATTERN = /(fitsync@okaxis|yourname@|\.example\b|\@example)/i;

const getUpiId = () => (process.env.UPI_ID || '').trim();
const getUpiName = () => (process.env.UPI_NAME || 'FitSync AI').trim();

const isUpiPlaceholder = (upiId) => Boolean(String(upiId).match(UPI_PLACEHOLDER_PATTERN));

const upiConfigured = () => {
  const id = getUpiId();
  return Boolean(id) && !id.startsWith('#') && !isUpiPlaceholder(id);
};

const stripeConfigured = () =>
  Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_live_'));

const getRazorpayKeyId = () => (process.env.RAZORPAY_KEY_ID || '').trim();
const getRazorpayKeySecret = () => (process.env.RAZORPAY_KEY_SECRET || '').trim();
const getRazorpayWebhookSecret = () => (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();

const razorpayConfigured = () => {
  const keyId = getRazorpayKeyId();
  return Boolean(keyId && getRazorpayKeySecret() && !keyId.startsWith('#'));
};

// Test keys (rzp_test_) are fine for development but never acceptable as a
// production checkout gateway - members would be unable to complete a payment.
const razorpayLiveConfigured = () =>
  Boolean(getRazorpayKeyId().startsWith('rzp_live_') && getRazorpayKeySecret());

const razorpayWebhookConfigured = () => Boolean(getRazorpayWebhookSecret());

const hasRealPaymentConfig = () => stripeConfigured() || razorpayLiveConfigured() || upiConfigured();

// Described by consumers when they need to communicate the current state
// without exposing any secret/provider credentials. Razorpay wins because it
// offers the richest checkout experience when both it and UPI are configured.
// keyId is deliberately public (Razorpay Checkout needs it), but neither the
// key secret nor the webhook secret ever leaves the server.
const describePaymentConfig = () => {
  if (razorpayConfigured()) {
    return {
      method: 'razorpay',
      keyId: getRazorpayKeyId(),
      live: razorpayLiveConfigured(),
      webhookConfigured: razorpayWebhookConfigured()
    };
  }
  if (stripeConfigured()) {
    return { method: 'stripe', live: true, webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET) };
  }
  if (upiConfigured()) return { method: 'upi', upiId: getUpiId() };
  return { method: 'unconfigured', live: false, webhookConfigured: false };
};

// A credential is "present" when it holds a real value - an empty shell or a
// `#`-prefixed commented-out value counts as absent and requires no check.
const isPresentCredential = (value) => Boolean(value) && !value.startsWith('#');

// Called at startup. Beyond refusing to boot without any real gateway, this
// rejects ANY present-but-invalid gateway credential in production:
//   - a present RAZORPAY_KEY_ID that is not rzp_live_* (e.g. rzp_test_*),
//   - a present STRIPE_SECRET_KEY that is not sk_live_* (e.g. sk_test_*),
//   - a live STRIPE_SECRET_KEY with no STRIPE_WEBHOOK_SECRET (Stripe checkout
//     can never complete without the signed completion webhook).
// A single leftover test key fails the whole boot even when another live
// gateway exists, so checkout can never silently select a test gateway.
const ensureProductionPaymentConfig = () => {
  if (process.env.NODE_ENV !== 'production') return;

  const razorpayKeyId = getRazorpayKeyId();
  if (isPresentCredential(razorpayKeyId) && !razorpayKeyId.startsWith('rzp_live_')) {
    throw new Error(
      '[payment-config] NODE_ENV=production requires a real payment configuration. ' +
      'RAZORPAY_KEY_ID is present but is NOT a live key (expected rzp_live_...). ' +
      'Razorpay test keys (rzp_test_...) are never acceptable as a production ' +
      'checkout gateway.'
    );
  }

  const stripeSecretKey = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (isPresentCredential(stripeSecretKey) && !stripeSecretKey.startsWith('sk_live_')) {
    throw new Error(
      '[payment-config] NODE_ENV=production requires a real payment configuration. ' +
      'STRIPE_SECRET_KEY is present but is NOT a live key (expected sk_live_...). ' +
      'Stripe test keys (sk_test_...) are never acceptable as a production ' +
      'checkout gateway.'
    );
  }

  if (
    isPresentCredential(stripeSecretKey) &&
    stripeSecretKey.startsWith('sk_live_') &&
    !Boolean((process.env.STRIPE_WEBHOOK_SECRET || '').trim())
  ) {
    throw new Error(
      '[payment-config] NODE_ENV=production requires a real payment configuration. ' +
      'STRIPE_SECRET_KEY is a live key (sk_live_...) so STRIPE_WEBHOOK_SECRET ' +
      'must also be set and non-empty - without the signed completion webhook ' +
      'a Stripe checkout can never complete.'
    );
  }

  if (!hasRealPaymentConfig()) {
    throw new Error(
      '[payment-config] NODE_ENV=production requires a real payment configuration. ' +
      'Set RAZORPAY_KEY_ID (rzp_live_...) with RAZORPAY_KEY_SECRET, STRIPE_SECRET_KEY ' +
      '(sk_live_...), or UPI_ID to a real UPI id. Test/placeholder keys are never ' +
      'acceptable as a production checkout gateway.'
    );
  }
};

module.exports = {
  getUpiId,
  getUpiName,
  isUpiPlaceholder,
  upiConfigured,
  stripeConfigured,
  getRazorpayKeyId,
  getRazorpayKeySecret,
  getRazorpayWebhookSecret,
  razorpayConfigured,
  razorpayLiveConfigured,
  razorpayWebhookConfigured,
  hasRealPaymentConfig,
  describePaymentConfig,
  ensureProductionPaymentConfig
};