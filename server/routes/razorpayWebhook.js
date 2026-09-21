// Razorpay webhook: signature-verified, idempotent payment reconciliation.
//
// Mounted with express.raw() so req.body is the exact byte payload Razorpay
// signed (the HMAC is computed over the RAW body, before any JSON parsing).
//
// The webhook is the safety net that completes a payment even when the member
// closes the browser after checkout. Both this handler and the checkout verify
// endpoint funnel through the same guarded status transitions in
// paymentLifecycle, so raced/repeated deliveries can never double-activate.

const Notification = require('../models/Notification');
const Payment = require('../models/Payment');
const {
  razorpayConfigured,
  getRazorpayWebhookSecret
} = require('../utils/paymentConfig');
const { verifyWebhookSignature, toPaise } = require('../utils/razorpayGateway');
const {
  completeGatewayPayment,
  failGatewayPayment,
  refundGatewayPayment
} = require('../utils/paymentLifecycle');

const notifyPaymentReceived = async (userId, amount) => {
  if (!userId) return;
  await Notification.create({
    user: userId,
    title: 'Payment Received',
    message: `We received a payment of ₹${Number(amount || 0).toLocaleString('en-IN')}. Thank you!`,
    type: 'general'
  });
};

const webhookHandler = async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body || ''));
  const signature = req.headers['x-razorpay-signature'];

  if (!razorpayConfigured() || !getRazorpayWebhookSecret()) {
    return res.status(503).json({ message: 'Webhook is not configured' });
  }
  if (!signature || !verifyWebhookSignature({ body: rawBody, signature })) {
    return res.status(400).json({ message: 'Invalid webhook signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (error) {
    return res.status(400).json({ message: 'Invalid payload' });
  }

  if (event.entity !== 'event' || typeof event.event !== 'string') {
    // Not a real Razorpay event envelope - acknowledge and move on.
    return res.status(200).json({ received: true });
  }

  try {
    const eventName = event.event;
    const entity = event.payload && event.payload.payment
      ? event.payload.payment.entity
      : null;

    if (!entity || !entity.order_id) {
      return res.status(200).json({ received: true });
    }

    const payment = await Payment.findOne({ gatewayOrderId: entity.order_id });
    if (!payment || String(payment.gateway) !== 'razorpay') {
      // Unknown / non-Razorpay order - nothing to reconcile. Acknowledge.
      return res.status(200).json({ received: true });
    }

    const expectedPaise = toPaise(payment.amount);
    const amountMatches = Number(entity.amount) === expectedPaise
      && String(entity.currency || '').toUpperCase() === 'INR';

    if (eventName === 'payment.captured') {
      if (!amountMatches) {
        // Never activate a membership on an amount mismatch.
        console.error(`[razorpay-webhook] amount mismatch for order ${entity.order_id}: entity=${entity.amount} expected=${expectedPaise}`);
        return res.status(200).json({ received: true });
      }
      const result = await completeGatewayPayment(payment._id, {
        gateway: 'razorpay',
        gatewayPaymentId: String(entity.id),
        gatewayStatus: String(entity.status || 'captured'),
        gatewayEventId: String(event.id),
        notes: `${payment.notes || 'Online payment'} (Razorpay gateway verified)`
      });
      if (result.outcome === 'completed') {
        await notifyPaymentReceived(payment.user, payment.amount);
      }
      return res.status(200).json({ received: true });
    }

    if (eventName === 'payment.failed') {
      if (payment.status === 'PENDING') {
        await failGatewayPayment(payment._id, {
          gatewayPaymentId: String(entity.id),
          gatewayStatus: String(entity.status || 'failed'),
          gatewayEventId: String(event.id)
        });
      }
      return res.status(200).json({ received: true });
    }

    if (eventName === 'payment.refunded') {
      await refundGatewayPayment(payment._id, {
        gatewayStatus: 'refunded',
        gatewayEventId: String(event.id)
      });
      return res.status(200).json({ received: true });
    }

    // Unhandled event type (authorized, created, down, etc.) - acknowledge.
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[razorpay-webhook] Error:', error.message);
    // Razorpay retries on non-2xx; surface a transient failure distinctly so
    // the delivery is not silently dropped.
    res.status(500).json({ message: 'Webhook processing error' });
  }
};

module.exports = webhookHandler;