const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const router = express.Router();
const Payment = require('../models/Payment');
const Membership = require('../models/Membership');
const MembershipPlan = require('../models/MembershipPlan');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const { activateMembershipFromPayment } = require('../utils/membershipActivation');
const razorpayGateway = require('../utils/razorpayGateway');
const stripeGateway = require('../utils/stripeGateway');
const { completeGatewayPayment, failGatewayPayment, refundGatewayPayment } = require('../utils/paymentLifecycle');
const {
  getUpiId,
  getUpiName,
  upiConfigured,
  stripeConfigured,
  hasRealPaymentConfig,
  razorpayConfigured,
  getRazorpayKeyId
} = require('../utils/paymentConfig');

const isProduction = () => process.env.NODE_ENV === 'production';

const generateUpiUri = ({ upiId, upiName, amount, note, reference }) => {
  const params = new URLSearchParams();
  params.set('pa', upiId);
  params.set('pn', upiName);
  params.set('am', Number(amount).toFixed(2));
  params.set('cu', 'INR');
  params.set('tn', note);
  params.set('tr', reference);
  return `upi://pay?${params.toString()}`;
};

const makeUpiReference = (paymentId) => `FS${String(paymentId).slice(-10).toUpperCase()}`;

const notifyPaymentReceived = async (userId, amount) => {
  if (!userId) return;
  await Notification.create({
    user: userId,
    title: 'Payment Received',
    message: `Your online payment of ₹${Number(amount || 0).toLocaleString('en-IN')} was successful.`,
    type: 'general'
  });
};

const notifyAdminsPaymentVerification = async (payment) => {
  const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
  if (admins.length === 0) return;
  const member = await User.findById(payment.user).select('name email').lean();
  await Notification.create(
    admins.map((a) => ({
      user: a._id,
      title: 'Payment Verification Needed',
      message: `${member?.name || 'A member'} confirmed a UPI payment of ₹${Number(payment.amount || 0).toLocaleString('en-IN')} (ref ${payment.transactionId || payment._id}). Please verify and approve it in Payments.`,
      type: 'general'
    }))
  );
};

// ----------------------------------------------------------------
// Create a checkout session for a membership plan
// ----------------------------------------------------------------
router.post('/create', auth, authorize('member'), async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ message: 'Plan is required' });

    const plan = await MembershipPlan.findOne({ _id: planId, isActive: true });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });

    if (!stripeConfigured() && !upiConfigured() && !razorpayConfigured()) {
      if (isProduction()) {
        return res.status(503).json({ message: 'Online payments are not configured. Please contact the gym to complete your purchase.' });
      }
      // Development/demo fallback - never reachable in production.
      const start = new Date();
      const end = new Date(start);
      end.setDate(end.getDate() + plan.duration);

      const membership = await Membership.create({
        user: req.user._id,
        plan: planId,
        startDate: start,
        endDate: end,
        status: 'PENDING'
      });

      const payment = await Payment.create({
        user: req.user._id,
        membership: membership._id,
        amount: plan.price,
        method: 'online',
        status: 'PENDING',
        transactionId: `DEV-DEMO-${Date.now()}`,
        notes: `DEMO/DEVELOPMENT checkout for ${plan.name}`,
        date: new Date()
      });

      return res.status(201).json({
        mode: 'demo',
        payment: payment._id,
        membership: membership._id,
        message: 'DEMO/DEVELOPMENT mode. Confirm the payment to simulate a successful gateway. Not available in production.'
      });
    }

    // Razorpay owns the online checkout whenever it is configured. It mints its
    // own order (with idempotent dedupe in /checkout/razorpay/order), so don't
    // create the membership/payment here - the client calls the order endpoint
    // and then verifies the real gateway callback.
    if (razorpayConfigured()) {
      return res.status(201).json({ mode: 'razorpay', planId: plan._id });
    }

    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + plan.duration);

    const membership = await Membership.create({
      user: req.user._id,
      plan: planId,
      startDate: start,
      endDate: end,
      status: 'PENDING'
    });

    const transactionId = `STRIPE-${membership._id}-${Date.now()}`;
    const payment = await Payment.create({
      user: req.user._id,
      membership: membership._id,
      amount: plan.price,
      method: 'online',
      status: 'PENDING',
      gateway: stripeConfigured() ? 'stripe' : undefined,
      transactionId,
      notes: `Online checkout for ${plan.name}`,
      date: new Date()
    });

    if (stripeConfigured()) {
      const session = await stripeGateway.createCheckoutSession({
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'inr',
            product_data: { name: `${plan.name} Membership` },
            unit_amount: Math.round(plan.price * 100)
          },
          quantity: 1
        }],
        success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/member/payments?checkout=success`,
        cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/member/membership?checkout=cancelled`,
        client_reference_id: String(payment._id),
        metadata: { paymentId: String(payment._id), membershipId: String(membership._id), userId: String(req.user._id), planId: String(planId) }
      });
      if (!session || !session.id) {
        throw new Error('Stripe did not return a checkout session id');
      }

      payment.transactionId = session.id;
      payment.gatewayStatus = 'created';
      await payment.save();

      return res.status(201).json({ url: session.url, mode: 'stripe', payment: payment._id, membership: membership._id });
    }

    if (upiConfigured()) {
      const reference = makeUpiReference(payment._id);
      const note = `${plan.name} - ${getUpiName()}`;
      const upiUri = generateUpiUri({ upiId: getUpiId(), upiName: getUpiName(), amount: plan.price, note, reference });

      payment.method = 'upi';
      payment.transactionId = reference;
      payment.notes = `UPI checkout for ${plan.name}`;
      await payment.save();

      return res.status(201).json({
        mode: 'upi',
        payment: payment._id,
        membership: membership._id,
        upiId: getUpiId(),
        upiName: getUpiName(),
        amount: plan.price,
        note,
        reference,
        planName: plan.name,
      });
    }

    res.status(503).json({ message: 'Online payments are not configured.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ----------------------------------------------------------------
// Confirm a payment (development demo simulation only)
// ----------------------------------------------------------------
router.post('/confirm/:paymentId', auth, authorize('member'), async (req, res) => {
  try {
    if (isProduction()) {
      // A member click is never a legitimate payment confirmation.
      return res.status(503).json({ message: 'Automatic payment confirmation is disabled in production.' });
    }

    const payment = await Payment.findById(req.params.paymentId);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if (String(payment.user) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not your payment' });
    }
    if (payment.status === 'COMPLETED') return res.json({ message: 'Payment already completed', payment });
    if (stripeConfigured()) return res.status(400).json({ message: 'Use the Stripe checkout flow' });
    // A gateway payment (Razorpay/Stripe) can only ever be completed by the
    // gateway itself - a member endpoint must never try to confirm it, even in
    // development. Manual/UPI payments stay PENDING until an admin verifies.
    if (payment.gateway) {
      return res.status(400).json({ message: 'Online gateway payments are confirmed only by the payment gateway' });
    }
    if (payment.method === 'upi') {
      return res.status(400).json({ message: 'UPI payments are verified by the gym, not self-confirmed' });
    }

    payment.status = 'COMPLETED';
    payment.notes = `${payment.notes || 'Online payment'} (DEMO/DEVELOPMENT simulated gateway)`;
    await payment.save();

    await activateMembershipFromPayment(payment.membership);
    await notifyPaymentReceived(payment.user, payment.amount);

    res.json({ message: 'Payment confirmed (DEMO)', payment });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ----------------------------------------------------------------
// Razorpay: create a gateway order for a plan
// ----------------------------------------------------------------
// The amount is always derived server-side from the plan price in paise -
// whatever the frontend sends is ignored. The PENDING membership + PENDING
// payment follow the same PENDING-first rules as every other checkout path.
router.post('/razorpay/order', auth, authorize('member'), async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ message: 'Plan is required' });

    if (!razorpayConfigured()) {
      return res.status(503).json({ message: 'Online payments are not configured. Please contact the gym to complete your purchase.' });
    }

    const plan = await MembershipPlan.findOne({ _id: planId, isActive: true });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });

    const paise = razorpayGateway.toPaise(plan.price);
    if (!Number.isInteger(paise) || paise <= 0) {
      return res.status(400).json({ message: 'Plan does not have a valid configurable price' });
    }

    // Reuse an existing PENDING razorpay payment for the same plan so two
    // tabs / repeated clicks never mint a second gateway order. Other statuses
    // are left alone (a previous FAILED/REFUNDED attempt starts fresh).
    const pendingMembership = await Membership.findOne({
      user: req.user._id,
      plan: plan._id,
      status: 'PENDING'
    }).sort({ createdAt: -1 }).lean();

    let payment = pendingMembership
      ? await Payment.findOne({ membership: pendingMembership._id, gateway: 'razorpay', status: 'PENDING' }).sort({ createdAt: -1 })
      : null;

    if (!payment) {
      const start = new Date();
      const end = new Date(start);
      end.setDate(end.getDate() + plan.duration);

      const membership = await Membership.create({
        user: req.user._id,
        plan: plan._id,
        startDate: start,
        endDate: end,
        status: 'PENDING'
      });

      payment = await Payment.create({
        user: req.user._id,
        membership: membership._id,
        amount: plan.price,
        method: 'online',
        status: 'PENDING',
        gateway: 'razorpay',
        notes: `Razorpay checkout for ${plan.name}`,
        date: new Date()
      });
    }

    if (!payment.gatewayOrderId) {
      const receipt = `FS${String(payment._id).slice(-10).toUpperCase()}`;
      const order = await razorpayGateway.createOrder({
        amount: paise,
        currency: 'INR',
        receipt,
        notes: {
          fitsyncPaymentId: String(payment._id),
          fitsyncMembershipId: String(payment.membership),
          fitsyncPlanId: String(plan._id)
        }
      });
      if (!order || !order.id) {
        throw new Error('Razorpay did not return an order id');
      }
      payment.gatewayOrderId = order.id;
      payment.gatewayStatus = 'created';
      payment.transactionId = order.id;
      await payment.save();
    }

    res.status(201).json({
      mode: 'razorpay',
      payment: payment._id,
      membership: payment.membership,
      keyId: getRazorpayKeyId(),
      orderId: payment.gatewayOrderId,
      amount: paise,
      currency: 'INR',
      planName: plan.name,
      planPrice: plan.price
    });
  } catch (error) {
    console.error('[checkout/razorpay-order] Error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ----------------------------------------------------------------
// Razorpay: verify a checkout callback
// ----------------------------------------------------------------
// The frontend never declares a payment successful on its own. This endpoint
// re-validates the signature, the order, the amount/currency and the real
// capture state from Razorpay before the payment may become COMPLETED. The
// completed transition uses the shared activateMembershipFromPayment() path.
router.post('/razorpay/verify', auth, authorize('member'), async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body || {};
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ message: 'Missing payment verification data' });
    }
    if (!razorpayConfigured()) {
      return res.status(503).json({ message: 'Online payments are not configured.' });
    }

    const payment = await Payment.findOne({ gatewayOrderId: razorpay_order_id });
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if (String(payment.user) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not your payment' });
    }
    if (payment.gateway !== 'razorpay') {
      return res.status(400).json({ message: 'Payment was not created through Razorpay' });
    }
    if (payment.status === 'COMPLETED') {
      return res.json({ message: 'Payment already completed', payment });
    }
    if (payment.status === 'FAILED') {
      return res.status(400).json({ message: 'Payment was not successful', payment });
    }
    if (payment.status === 'REFUNDED') {
      return res.status(400).json({ message: 'Payment has been refunded', payment });
    }

    // 1. Cryptographic signature - only Razorpay can produce a valid one for
    //    this order+payment pair using the server-side key secret.
    const signatureValid = razorpayGateway.verifyPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature
    });
    if (!signatureValid) {
      return res.status(400).json({ message: 'Payment signature verification failed' });
    }

    const expectedPaise = razorpayGateway.toPaise(payment.amount);

    // 2. Order must exist on the gateway and carry the expected amount/currency.
    let order;
    try {
      order = await razorpayGateway.fetchOrder(payment.gatewayOrderId);
    } catch (error) {
      console.error('[checkout/razorpay-verify] order fetch failed:', error.message);
      return res.status(502).json({ message: 'Could not verify the payment with the gateway. Please try again shortly.' });
    }
    if (!order || order.id !== payment.gatewayOrderId
      || Number(order.amount) !== expectedPaise
      || String(order.currency).toUpperCase() !== 'INR') {
      return res.status(400).json({ message: 'Order verification failed' });
    }

    // 3. Actual capture state from the gateway - never trust the callback alone.
    let gatewayPayment;
    try {
      gatewayPayment = await razorpayGateway.fetchPayment(razorpay_payment_id);
    } catch (error) {
      console.error('[checkout/razorpay-verify] payment fetch failed:', error.message);
      return res.status(502).json({ message: 'Could not verify the payment with the gateway. Please try again shortly.' });
    }
    if (!gatewayPayment || gatewayPayment.id !== razorpay_payment_id
      || String(gatewayPayment.order_id) !== payment.gatewayOrderId) {
      return res.status(400).json({ message: 'Payment verification failed' });
    }
    if (Number(gatewayPayment.amount) !== expectedPaise
      || String(gatewayPayment.currency || '').toUpperCase() !== 'INR') {
      return res.status(400).json({ message: 'Payment amount verification failed' });
    }

    if (gatewayPayment.status === 'failed') {
      await failGatewayPayment(payment._id, {
        gatewayStatus: String(gatewayPayment.status),
        gatewayPaymentId: String(gatewayPayment.id)
      });
      return res.status(400).json({ message: 'Payment failed at the gateway', payment });
    }

    if (gatewayPayment.status !== 'captured') {
      // authorized/pending - not collected yet. Membership must NOT activate.
      return res.status(202).json({
        message: 'Payment received but not yet captured. Your membership will activate automatically once the gateway confirms it.',
        payment
      });
    }

    const result = await completeGatewayPayment(payment._id, {
      gateway: 'razorpay',
      gatewayPaymentId: String(gatewayPayment.id),
      gatewayStatus: String(gatewayPayment.status),
      gatewaySignature: razorpay_signature,
      notes: `${payment.notes || 'Online payment'} (Razorpay gateway verified)`
    });

    if (result.outcome === 'completed') {
      await notifyPaymentReceived(payment.user, payment.amount);
    }

    res.json({ message: 'Payment verified', payment: result.payment });
  } catch (error) {
    console.error('[checkout/razorpay-verify] Error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ----------------------------------------------------------------
// UPI: serve the scan-to-pay QR for a pending payment
// ----------------------------------------------------------------
router.get('/upi/qr/:paymentId', auth, authorize('member'), async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if (String(payment.user) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not your payment' });
    }
    if (payment.method !== 'upi') return res.status(400).json({ message: 'Not a UPI payment' });
    if (!upiConfigured()) return res.status(400).json({ message: 'UPI is not configured' });

    const reference = payment.transactionId || makeUpiReference(payment._id);
    const uri = generateUpiUri({
      upiId: getUpiId(),
      upiName: getUpiName(),
      amount: payment.amount,
      note: payment.notes || `${getUpiName()} membership`,
      reference,
    });

    const svg = await QRCode.toString(uri, { type: 'svg', errorCorrectionLevel: 'H', margin: 1 });
    res.type('image/svg+xml').send(svg);
  } catch (error) {
    console.error('[checkout/upi-qr] Error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ----------------------------------------------------------------
// UPI: member says they paid via their UPI app
// ----------------------------------------------------------------
// Scanning a QR is NOT payment verification. A member click only records
// their claim; the payment stays PENDING until an admin verifies the
// transfer and approves it (see POST /api/payments/:id/verify).
router.post('/upi/confirm/:paymentId', auth, authorize('member'), async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if (String(payment.user) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not your payment' });
    }
    if (payment.method !== 'upi') return res.status(400).json({ message: 'Not a UPI payment' });
    if (payment.status === 'COMPLETED') return res.json({ message: 'Payment already completed', payment });

    const reference = payment.transactionId || makeUpiReference(payment._id);
    payment.notes = `${payment.notes || 'UPI payment'} via ${getUpiId()} (ref ${reference}) - member submitted for verification`;
    await payment.save();

    await notifyAdminsPaymentVerification(payment);

    res.json({
      message: 'Payment submitted for verification. The gym will confirm once the payment is received.',
      payment
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ----------------------------------------------------------------
// Stripe webhook (checkout.session.completed / payment_intent.succeeded /
// charge.refunded)
// ----------------------------------------------------------------
// Signature verification is MANDATORY and unconditional: a webhook body is
// never trusted without a valid Stripe signature. Every state transition goes
// through the atomic, status-guarded paymentLifecycle helpers so concurrent or
// repeated deliveries can never double-complete a payment or double-activate a
// membership.
const webhookHandler = async (req, res) => {
  let event;
  try {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ message: 'Missing stripe-signature header' });
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(503).json({ message: 'Webhook is not configured' });
    }

    const raw = Buffer.isBuffer(req.body) ? req.body : req.rawBody;
    try {
      event = stripeGateway.verifyWebhookSignature(raw, signature);
    } catch (error) {
      console.error('[checkout/stripe-webhook] signature verification failed:', error.message);
      return res.status(400).json({ message: 'Invalid webhook signature' });
    }

    if (!event || typeof event !== 'object' || !event.type) {
      return res.status(400).json({ message: 'Invalid webhook event' });
    }
  } catch (error) {
    console.error('[checkout/stripe-webhook] handler error:', error.message);
    return res.status(500).json({ message: 'Webhook processing error' });
  }

  try {
    const eventObject = event.data && event.data.object ? event.data.object : {};
    const paymentId = eventObject.metadata?.paymentId || eventObject.client_reference_id;

    if (event.type === 'checkout.session.completed') {
      const session = eventObject;
      const payment = paymentId ? await Payment.findById(paymentId) : null;
      if (!payment) {
        console.warn('[checkout/stripe-webhook] checkout.session.completed references an unknown payment');
        return res.status(200).json({ received: true });
      }
      if (payment.gateway !== 'stripe') {
        console.warn(`[checkout/stripe-webhook] payment ${payment._id} gateway is ${payment.gateway}, expected stripe`);
        return res.status(400).json({ message: 'Payment was not created through Stripe' });
      }
      if (payment.status === 'FAILED' || payment.status === 'REFUNDED') {
        console.warn(`[checkout/stripe-webhook] refusing to complete ${payment.status} payment ${payment._id}`);
        return res.status(200).json({ received: true });
      }
      if (Number(payment.amount) * 100 !== Number(session.amount_total)) {
        console.warn(`[checkout/stripe-webhook] amount mismatch for payment ${payment._id}: expected ${Number(payment.amount) * 100}, got ${session.amount_total}`);
        return res.status(200).json({ received: true });
      }
      if (String(session.currency || 'inr').toLowerCase() !== 'inr') {
        console.warn(`[checkout/stripe-webhook] currency mismatch for payment ${payment._id}: ${session.currency}`);
        return res.status(200).json({ received: true });
      }

      const result = await completeGatewayPayment(payment._id, {
        gateway: 'stripe',
        gatewayPaymentId: session.payment_intent || session.id,
        gatewayStatus: 'completed',
        gatewayEventId: event.id,
        notes: `${payment.notes || 'Online payment'} (Stripe checkout ${session.id})`.trim()
      });

      if (result.outcome === 'completed') {
        await notifyPaymentReceived(payment.user, payment.amount);
      }
      return res.status(200).json({ received: true });
    }

    if (event.type === 'payment_intent.succeeded') {
      const pi = eventObject;
      const payment = paymentId ? await Payment.findById(paymentId) : null;
      if (!payment) {
        console.warn('[checkout/stripe-webhook] payment_intent.succeeded references an unknown payment');
        return res.status(200).json({ received: true });
      }
      if (payment.gateway !== 'stripe') {
        console.warn(`[checkout/stripe-webhook] payment ${payment._id} gateway is ${payment.gateway}, expected stripe`);
        return res.status(400).json({ message: 'Payment was not created through Stripe' });
      }
      if (payment.status === 'FAILED' || payment.status === 'REFUNDED') {
        console.warn(`[checkout/stripe-webhook] refusing to complete ${payment.status} payment ${payment._id}`);
        return res.status(200).json({ received: true });
      }
      if (Number(payment.amount) * 100 !== Number(pi.amount)) {
        console.warn(`[checkout/stripe-webhook] amount mismatch for payment ${payment._id}: expected ${Number(payment.amount) * 100}, got ${pi.amount}`);
        return res.status(200).json({ received: true });
      }
      if (String(pi.currency || 'inr').toLowerCase() !== 'inr') {
        console.warn(`[checkout/stripe-webhook] currency mismatch for payment ${payment._id}: ${pi.currency}`);
        return res.status(200).json({ received: true });
      }

      const result = await completeGatewayPayment(payment._id, {
        gateway: 'stripe',
        gatewayPaymentId: pi.id,
        gatewayStatus: 'succeeded',
        gatewayEventId: event.id,
        notes: `${payment.notes || 'Online payment'} (Stripe payment_intent ${pi.id})`.trim()
      });

      if (result.outcome === 'completed') {
        await notifyPaymentReceived(payment.user, payment.amount);
      }
      return res.status(200).json({ received: true });
    }

    if (event.type === 'charge.refunded') {
      const charge = eventObject;
      const byIntent = charge.payment_intent || charge.id
        ? await Payment.findOne({ gatewayPaymentId: charge.payment_intent || charge.id })
        : null;
      const payment = byIntent || (paymentId ? await Payment.findById(paymentId) : null);
      if (!payment) {
        console.warn('[checkout/stripe-webhook] charge.refunded references an unknown payment');
        return res.status(200).json({ received: true });
      }
      if (payment.gateway !== 'stripe') {
        console.warn(`[checkout/stripe-webhook] payment ${payment._id} gateway is ${payment.gateway}, expected stripe`);
        return res.status(400).json({ message: 'Payment was not created through Stripe' });
      }

      // refundGatewayPayment atomically moves COMPLETED -> REFUNDED and revokes
      // the linked membership. Idempotent under re-delivery.
      await refundGatewayPayment(payment._id, {
        gatewayStatus: 'refunded',
        gatewayEventId: event.id,
        notes: `${payment.notes || ''} (Stripe refund ${charge.balance_transaction || charge.id})`.trim()
      });
      return res.status(200).json({ received: true });
    }

    // Any other event is acknowledged without action so Stripe stops retrying.
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[checkout/stripe-webhook] processing error:', error.message);
    return res.status(500).json({ message: 'Webhook processing error' });
  }
};

module.exports = { router, webhookHandler };