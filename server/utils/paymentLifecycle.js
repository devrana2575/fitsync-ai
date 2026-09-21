// Single shared payment-state transition layer for gateway-confirmed payments
// (Razorpay checkout verification + webhook reconciliation + webhook refunds).
//
// Every transition is guarded by the source status in the update filter, so
// concurrent/repeated deliveries can never double-complete a payment or
// double-activate a membership: exactly one caller wins the atomic transition
// and everyone else observes the already-terminal state.
//
// Membership activation ONLY ever flows through activateMembershipFromPayment()
// (and refunds through cancelLinkedMembership()).

const Payment = require('../models/Payment');
const {
  activateMembershipFromPayment,
  cancelLinkedMembership
} = require('./membershipActivation');

const sanitize = (fields) => {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out;
};

// PENDING -> COMPLETED once a verified gateway confirmation exists.
const completeGatewayPayment = async (paymentId, transitionFields) => {
  const payment = await Payment.findOneAndUpdate(
    { _id: paymentId, status: 'PENDING' },
    {
      $set: {
        status: 'COMPLETED',
        gatewayVerifiedAt: new Date(),
        ...sanitize(transitionFields)
      }
    },
    { new: true }
  );

  if (!payment) {
    const existing = await Payment.findById(paymentId);
    if (existing && existing.status === 'COMPLETED') {
      return { outcome: 'already_completed', payment: existing };
    }
    return { outcome: 'not_found', payment: null };
  }

  await activateMembershipFromPayment(payment.membership);
  return { outcome: 'completed', payment };
};

// PENDING -> FAILED when the gateway reports the payment failed.
const failGatewayPayment = async (paymentId, transitionFields) => {
  const payment = await Payment.findOneAndUpdate(
    { _id: paymentId, status: 'PENDING' },
    { $set: { status: 'FAILED', ...sanitize(transitionFields) } },
    { new: true }
  );

  if (!payment) {
    const existing = await Payment.findById(paymentId);
    if (existing && existing.status === 'FAILED') {
      return { outcome: 'already_failed', payment: existing };
    }
    return { outcome: 'not_found', payment: null };
  }

  return { outcome: 'failed', payment };
};

// COMPLETED -> REFUNDED (gateway-confirmed). Access is revoked.
const refundGatewayPayment = async (paymentId, transitionFields) => {
  const payment = await Payment.findOneAndUpdate(
    { _id: paymentId, status: 'COMPLETED' },
    { $set: { status: 'REFUNDED', ...sanitize(transitionFields) } },
    { new: true }
  );

  if (!payment) {
    const existing = await Payment.findById(paymentId);
    if (existing && existing.status === 'REFUNDED') {
      return { outcome: 'already_refunded', payment: existing };
    }
    return { outcome: 'not_found', payment: null };
  }

  await cancelLinkedMembership(payment.membership);
  return { outcome: 'refunded', payment };
};

module.exports = {
  completeGatewayPayment,
  failGatewayPayment,
  refundGatewayPayment
};