const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const Payment = require('../models/Payment');
const Membership = require('../models/Membership');
const MembershipPlan = require('../models/MembershipPlan');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const { parsePagination } = require('../utils/helpers');
const { activateMembershipFromPayment, cancelLinkedMembership } = require('../utils/membershipActivation');
const { validateManualPaymentAmount, isMembershipFullyPaid } = require('../utils/paymentTerms');
const razorpayGateway = require('../utils/razorpayGateway');
const { getGymMonthStart, getGymTimezone } = require('../utils/gymTime');

const makeReceiptNumber = () => `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

const notifyPaymentReceived = async (userId, amount) => {
  if (!userId) return;
  await Notification.create({
    user: userId,
    title: 'Payment Received',
    message: `We received a payment of ₹${Number(amount || 0).toLocaleString('en-IN')}. Thank you!`,
    type: 'payment'
  });
};

// Activate only when the plan is actually covered. FULL plans always are after
// a single exact-price payment; INSTALLMENT plans stay PENDING until the
// cumulative COMPLETED total reaches the plan price.
const activateWhenFullyPaid = async (membershipId) => {
  if (await isMembershipFullyPaid(membershipId)) {
    await activateMembershipFromPayment(membershipId);
  }
};

const markAsConfirmed = async (payment, req) => {
  payment.confirmedBy = req.user._id;
  payment.confirmedAt = new Date();
  await payment.save();
};

router.get('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query.page, req.query.limit, 1, 20, 100);
    const { status, userId, startDate, endDate } = req.query;
    const filter = {};
    if (status) filter.status = status.toUpperCase();
    if (userId) filter.user = userId;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const total = await Payment.countDocuments(filter);
    const payments = await Payment.find(filter)
      .select('user amount method status date membership transactionId notes confirmedBy confirmedAt gateway gatewayOrderId gatewayPaymentId gatewayStatus gatewayVerifiedAt')
      .populate('user', 'name email')
      .populate({ path: 'membership', select: 'plan startDate endDate status', populate: { path: 'plan', select: 'name price' } })
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({ payments, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/my', auth, async (req, res) => {
  try {
    const payments = await Payment.find({ user: req.user._id })
      .select('user amount method status date membership gateway gatewayStatus gatewayOrderId gatewayPaymentId')
      .populate({ path: 'membership', populate: { path: 'plan', select: 'name' } })
      .sort({ date: -1 })
      .limit(100)
      .lean();
    res.json({ payments });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin records a counter/cash/UPI payment.
router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { userId, membershipId, planId, amount, method, transactionId, notes, status } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const target = await User.findById(userId).select('role').lean();
    if (!target || target.role !== 'member') {
      return res.status(400).json({ message: 'Selected user is not a member' });
    }

    const normalizedStatus = (status || 'COMPLETED').toUpperCase();

    let targetMembership = membershipId || null;

    if (!targetMembership && planId) {
      const plan = await MembershipPlan.findById(planId);
      if (!plan) return res.status(404).json({ message: 'Plan not found' });

      // Reuse an existing PENDING membership for this user + plan (e.g. one
      // created by the Assign flow) so we don't duplicate pending rows.
      const existingPending = await Membership.findOne({ user: userId, plan: plan._id, status: 'PENDING' });
      if (existingPending) {
        targetMembership = existingPending._id;
      } else {
        // Open-ended planId payments would mint a fresh membership every time.
        // For installment plans, once the price is covered the plan is closed;
        // further installments must not start a new membership.
        if (plan.paymentMode === 'INSTALLMENT') {
          const alreadyCovered = await Membership.findOne({ user: userId, plan: plan._id, status: 'ACTIVE' });
          if (alreadyCovered) {
            return res.status(400).json({ message: 'Overpayment rejected: this installment plan is already fully covered by an active membership' });
          }
        }
        const start = new Date();
        const end = new Date(start);
        end.setDate(end.getDate() + plan.duration);

        // Always created PENDING - activation happens only through
        // activateMembershipFromPayment() once the payment is COMPLETED.
        const membership = await Membership.create({
          user: userId,
          plan: plan._id,
          startDate: start,
          endDate: end,
          status: 'PENDING',
          autoRenew: false
        });
        targetMembership = membership._id;
      }
    }

    if (normalizedStatus === 'COMPLETED') {
      const amountError = await validateManualPaymentAmount({ membershipId: targetMembership, planId, amount });
      if (amountError) return res.status(400).json({ message: amountError.error });
    }

    const payment = await Payment.create({
      user: userId,
      membership: targetMembership,
      amount,
      method: method || 'cash',
      transactionId: transactionId || makeReceiptNumber(),
      notes,
      status: normalizedStatus,
      date: new Date(),
      confirmedBy: normalizedStatus === 'COMPLETED' ? req.user._id : undefined,
      confirmedAt: normalizedStatus === 'COMPLETED' ? new Date() : undefined
    });

    if (payment.status === 'COMPLETED') {
      await activateWhenFullyPaid(targetMembership);
      await notifyPaymentReceived(userId, amount);
    }

    res.status(201).json({ payment });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Authorized admin verification for payments that the member claims but which
// cannot be confirmed automatically (UPI scan-to-pay). Records who confirmed
// and when, then activates the membership through the shared activation path.
router.post('/:id/verify', auth, authorize('admin'), async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if (payment.status === 'COMPLETED') {
      return res.json({ message: 'Payment already completed', payment });
    }
    if (payment.status === 'REFUNDED') {
      return res.status(400).json({ message: 'A refunded payment cannot be approved' });
    }

    const amountError = await validateManualPaymentAmount({
      membershipId: String(payment.membership || ''),
      amount: payment.amount,
      excludePaymentId: payment._id
    });
    if (amountError) return res.status(400).json({ message: amountError.error });

    payment.status = 'COMPLETED';
    payment.confirmedBy = req.user._id;
    payment.confirmedAt = new Date();
    payment.notes = `${payment.notes || ''} (verified by ${req.user.name || req.user._id})`.trim();
    await payment.save();

    await activateWhenFullyPaid(payment.membership);
    await notifyPaymentReceived(payment.user, payment.amount);

    res.json({ message: 'Payment verified and completed', payment });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { amount, method, transactionId, notes, status } = req.body;
    const update = {};
    if (amount !== undefined) update.amount = amount;
    if (method !== undefined) update.method = method;
    if (transactionId !== undefined) update.transactionId = transactionId;
    if (notes !== undefined) update.notes = notes;

    const existing = await Payment.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Payment not found' });

    const nextStatus = status !== undefined ? status.toUpperCase() : existing.status;
    if (nextStatus === 'COMPLETED') {
      const amountError = await validateManualPaymentAmount({
        membershipId: String(existing.membership || ''),
        amount: amount ?? existing.amount,
        excludePaymentId: existing._id
      });
      if (amountError) return res.status(400).json({ message: amountError.error });
      update.status = 'COMPLETED';
      update.confirmedBy = req.user._id;
      update.confirmedAt = new Date();
    } else if (status !== undefined) {
      if (nextStatus === 'REFUNDED') {
        // Online Razorpay captures are refunded at the gateway FIRST - FitSync
        // never claims a refund succeeded until Razorpay actually confirms it.
        if (existing.gateway === 'razorpay' && existing.gatewayPaymentId) {
          let refund;
          try {
            refund = await razorpayGateway.createRefund(existing.gatewayPaymentId, {
              amount: razorpayGateway.toPaise(existing.amount),
              notes: `FitSync AI admin refund (${req.user.name || req.user._id})`
            });
          } catch (error) {
            console.error('[payments/refund] Razorpay refund failed:', error.message);
            return res.status(502).json({ message: 'Razorpay did not confirm the refund. The payment was not marked refunded.' });
          }
          update.gatewayStatus = 'refunded';
          update.notes = `${existing.notes || ''} (Razorpay refund ${refund && refund.id ? refund.id : ''})`.trim();
        }
        update.status = 'REFUNDED';
        update.confirmedBy = req.user._id;
        update.confirmedAt = new Date();
      } else if (nextStatus !== 'PENDING' && nextStatus !== 'FAILED') {
        return res.status(400).json({ message: 'Invalid payment status' });
      } else {
        update.status = nextStatus;
      }
    }

    const payment = await Payment.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    );

    if (payment.status === 'COMPLETED' && existing.status !== 'COMPLETED') {
      await activateWhenFullyPaid(payment.membership);
      await notifyPaymentReceived(payment.user, payment.amount);
    }

    if (payment.status === 'REFUNDED' && payment.membership) {
      // A refunded payment must not leave the member with active access.
      await cancelLinkedMembership(payment.membership);
    }

    res.json({ payment });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/stats', auth, authorize('admin'), async (req, res) => {
  try {
    const monthStart = getGymMonthStart();
    const tz = getGymTimezone();

    const [totalRevenue, monthlyRevenue, pendingAmount, monthlyTrend] = await Promise.all([
      Payment.aggregate([
        { $match: { status: 'COMPLETED' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Payment.aggregate([
        { $match: { status: 'COMPLETED', date: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Payment.aggregate([
        { $match: { status: 'PENDING' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Payment.aggregate([
        { $match: { status: 'COMPLETED' } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$date', timezone: tz } },
            total: { $sum: '$amount' }
          }
        },
        { $sort: { _id: -1 } },
        { $limit: 12 }
      ])
    ]);

    const trend = monthlyTrend.map((t) => {
      const [year, month] = t._id.split('-');
      return { year: Number(year), month: Number(month), total: t.total };
    });

    res.json({
      totalRevenue: totalRevenue[0]?.total || 0,
      monthlyRevenue: monthlyRevenue[0]?.total || 0,
      pendingAmount: pendingAmount[0]?.total || 0,
      monthlyTrend: trend
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;