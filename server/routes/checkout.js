const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const router = express.Router();
const Payment = require('../models/Payment');
const Membership = require('../models/Membership');
const MembershipPlan = require('../models/MembershipPlan');
const Notification = require('../models/Notification');
const { auth, authorize } = require('../middleware/auth');

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

const UPI_ID = (process.env.UPI_ID || '').trim();
const UPI_NAME = (process.env.UPI_NAME || 'FitSync AI').trim();
const upiEnabled = () => UPI_ID && !UPI_ID.startsWith('#');

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

const activateMembershipFromPayment = async (membershipId) => {
  if (!membershipId) return;
  const membership = await Membership.findById(membershipId).populate('plan');
  if (!membership || membership.status === 'ACTIVE' || membership.status === 'CANCELLED') return;

  await Membership.updateMany(
    { user: membership.user, status: 'ACTIVE', _id: { $ne: membership._id } },
    { status: 'CANCELLED' }
  );

  const now = new Date();
  const start = new Date();
  const end = new Date(start);
  if (membership.plan && membership.plan.duration) {
    end.setDate(end.getDate() + membership.plan.duration);
  }
  if (membership.status === 'EXPIRED' || !membership.endDate || membership.endDate <= now) {
    membership.startDate = start;
    membership.endDate = end;
  }
  membership.status = 'ACTIVE';
  await membership.save();
};

const notifyPaymentReceived = async (userId, amount) => {
  if (!userId) return;
  await Notification.create({
    user: userId,
    title: 'Payment Received',
    message: `Your online payment of ₹${Number(amount || 0).toLocaleString('en-IN')} was successful.`,
    type: 'general'
  });
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

    if (upiEnabled()) {
      const reference = makeUpiReference(payment._id);
      const note = `${plan.name} - ${UPI_NAME}`;
      const upiUri = generateUpiUri({ upiId: UPI_ID, upiName: UPI_NAME, amount: plan.price, note, reference });

      payment.method = 'upi';
      payment.transactionId = reference;
      payment.notes = `UPI checkout for ${plan.name}`;
      await payment.save();

      return res.status(201).json({
        mode: 'upi',
        payment: payment._id,
        membership: membership._id,
        upiId: UPI_ID,
        upiName: UPI_NAME,
        amount: plan.price,
        note,
        reference,
        planName: plan.name,
      });
    }

    // Dev/demo mode: no gateway configured.
    res.status(201).json({ url: null, mode: 'demo', payment: payment._id, membership: membership._id, message: 'Demo mode. Confirm the payment to simulate a successful gateway.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ----------------------------------------------------------------
// Confirm a payment (demo mode simulation of a successful gateway)
// ----------------------------------------------------------------
router.post('/confirm/:paymentId', auth, authorize('member'), async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if (String(payment.user) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not your payment' });
    }
    if (payment.status === 'COMPLETED') return res.json({ message: 'Payment already completed', payment });
    if (stripe) return res.status(400).json({ message: 'Use the Stripe checkout flow' });

    payment.status = 'COMPLETED';
    payment.notes = `${payment.notes || 'Online payment'} (simulated gateway)`;
    await payment.save();

    await activateMembershipFromPayment(payment.membership);
    await notifyPaymentReceived(payment.user, payment.amount);

    res.json({ message: 'Payment confirmed', payment });
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
    if (!upiEnabled()) return res.status(400).json({ message: 'UPI is not configured' });

    const reference = payment.transactionId || makeUpiReference(payment._id);
    const uri = generateUpiUri({
      upiId: UPI_ID,
      upiName: UPI_NAME,
      amount: payment.amount,
      note: payment.notes || `${UPI_NAME} membership`,
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
// UPI: member confirms they paid via their UPI app
// ----------------------------------------------------------------
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
    payment.status = 'COMPLETED';
    payment.notes = `${payment.notes || 'UPI payment'} via ${UPI_ID} (ref ${reference})`;
    await payment.save();

    await activateMembershipFromPayment(payment.membership);
    await notifyPaymentReceived(payment.user, payment.amount);

    res.json({ message: 'Payment confirmed, membership activated', payment });
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
    const raw = Buffer.isBuffer(req.body) ? null : req.body;
    res.status(400).json({ message: `Webhook error: ${error.message}` });
  }
};

module.exports = { router, webhookHandler };