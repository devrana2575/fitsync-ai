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
const {
  getUpiId,
  getUpiName,
  upiConfigured,
  stripeConfigured,
  hasRealPaymentConfig
} = require('../utils/paymentConfig');

let stripe = null;
if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

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

    if (!stripe && !upiConfigured()) {
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
      transactionId,
      notes: `Online checkout for ${plan.name}`,
      date: new Date()
    });

    if (stripe) {
      const session = await stripe.checkout.sessions.create({
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

      payment.transactionId = session.id;
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
    if (stripe) return res.status(400).json({ message: 'Use the Stripe checkout flow' });

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
// Stripe webhook (handles checkout.session.completed)
// ----------------------------------------------------------------
const webhookHandler = async (req, res) => {
  try {
    let event = req.body;
    const signature = req.headers['stripe-signature'];
    if (stripe && process.env.STRIPE_WEBHOOK_SECRET && signature) {
      const raw = Buffer.isBuffer(req.body) ? req.body : req.rawBody;
      event = stripe.webhooks.constructEvent(raw, signature, process.env.STRIPE_WEBHOOK_SECRET);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const paymentId = session.metadata?.paymentId || session.client_reference_id;
      const payment = await Payment.findById(paymentId);
      if (payment && payment.status !== 'COMPLETED') {
        payment.status = 'COMPLETED';
        payment.transactionId = session.payment_intent || payment.transactionId;
        payment.notes = `${payment.notes || ''} (Stripe ${session.id})`.trim();
        await payment.save();

        await activateMembershipFromPayment(payment.membership);
        await notifyPaymentReceived(payment.user, payment.amount);
      }
    }

    res.json({ received: true });
  } catch (error) {
    res.status(400).json({ message: `Webhook error: ${error.message}` });
  }
};

module.exports = { router, webhookHandler };