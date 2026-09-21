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

// Called at startup. In production the server must not boot without a real
// gateway configured - the placeholder UPI id and razorpay test keys are
// explicitly rejected.
const ensureProductionPaymentConfig = () => {
  if (process.env.NODE_ENV !== 'production') return;
  if (hasRealPaymentConfig()) return;
  throw new Error(
    '[payment-config] NODE_ENV=production requires a real payment configuration. ' +
    'Set RAZORPAY_KEY_ID (rzp_live_...) with RAZORPAY_KEY_SECRET, STRIPE_SECRET_KEY ' +
    '(sk_live_...), or UPI_ID to a real UPI id. Test/placeholder keys are never ' +
    'acceptable as a production checkout gateway.'
  );
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