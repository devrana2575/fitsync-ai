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

const hasRealPaymentConfig = () => stripeConfigured() || upiConfigured();

// Described by consumers when they need to communicate the current state
// without exposing any secret/provider credentials.
const describePaymentConfig = () => {
  if (stripeConfigured()) return { method: 'stripe' };
  if (upiConfigured()) return { method: 'upi', upiId: getUpiId() };
  return { method: 'unconfigured' };
};

// Called at startup. In production the server must not boot without a real
// gateway configured - the placeholder UPI id is explicitly rejected.
const ensureProductionPaymentConfig = () => {
  if (process.env.NODE_ENV !== 'production') return;
  if (hasRealPaymentConfig()) return;
  throw new Error(
    '[payment-config] NODE_ENV=production requires a real payment configuration. ' +
    'Set STRIPE_SECRET_KEY (sk_...) or UPI_ID to a real UPI id. The placeholder ' +
    '(e.g. fitsync@okaxis) is not a valid production identity.'
  );
};

module.exports = {
  getUpiId,
  getUpiName,
  isUpiPlaceholder,
  upiConfigured,
  stripeConfigured,
  hasRealPaymentConfig,
  describePaymentConfig,
  ensureProductionPaymentConfig
};