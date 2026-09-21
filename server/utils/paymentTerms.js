'use strict';

const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Membership = require('../models/Membership');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const toObjectId = (value) => {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) return new mongoose.Types.ObjectId(String(value));
  return null;
};

// Sum of all COMPLETED (non-refunded, non-failed) payment amounts recorded
// against a membership. Optionally excludes one payment id so validation can
// reason about the paid state *before* the payment being processed.
const getMembershipPaid = async (membershipId, excludePaymentId) => {
  const membership = toObjectId(membershipId);
  if (!membership) return 0;
  const match = { membership, status: 'COMPLETED' };
  const exclude = toObjectId(excludePaymentId);
  if (exclude) match._id = { $ne: exclude };
  const [row] = await Payment.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  return row ? round2(row.total) : 0;
};

// Fixed per-installment amount for an INSTALLMENT plan, or null when the plan
// is a single-payment FULL plan.
const getInstallmentAmount = (plan) =>
  plan && plan.paymentMode === 'INSTALLMENT' && plan.installments > 1
    ? Number(plan.installmentAmount)
    : null;

// Validate a manual (counter/cash/UPI/bank-transfer) payment amount against the
// plan's payment configuration.
//
// FULL plans:      a COMPLETED payment must equal the plan price exactly. No
//                  cumulative check - multiple full payments are legitimate
//                  (renewals / advance terms), matching prior behaviour.
// INSTALLMENT plans: a COMPLETED payment must equal the configured installment
//                  amount exactly (no arbitrary partial amounts) and must not
//                  push the cumulative paid total past the plan price
//                  (overpayment rejected).
//
// Returns null when valid, otherwise { error: <message> }.
const validateManualPaymentAmount = async ({ amount, membershipId, planId, excludePaymentId }) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return { error: 'Amount must be greater than zero' };
  }

  let plan = null;
  if (planId) {
    plan = await require('../models/MembershipPlan').findById(planId);
  } else if (membershipId) {
    const membership = await Membership.findById(membershipId).populate('plan');
    plan = membership?.plan || null;
  }
  if (!plan) return null; // member-directed amount without a linked plan - not enforced

  if (plan.paymentMode === 'INSTALLMENT' && plan.installments > 1) {
    const step = getInstallmentAmount(plan);
    if (value !== step) {
      return {
        error: `This plan is paid in fixed installments of ₹${step} (${plan.installments} × ₹${step}). Partial amounts are not accepted.`
      };
    }
    const paid = await getMembershipPaid(membershipId, excludePaymentId);
    if (paid + value > Number(plan.price)) {
      return {
        error: `Overpayment rejected: this plan's total is ₹${plan.price} and it is already covered up to ₹${paid}.`
      };
    }
    return null;
  }

  if (value !== Number(plan.price)) {
    return { error: `Amount does not match the ${plan.name} plan price (₹${plan.price})` };
  }
  return null;
};

// True when the COMPLETED payments against a membership cover the full plan
// price. Used to decide when an INSTALLMENT membership may become ACTIVE.
const isMembershipFullyPaid = async (membershipId) => {
  if (!membershipId) return false;
  const membership = await Membership.findById(membershipId).populate('plan');
  if (!membership || !membership.plan) return false;
  const paid = await getMembershipPaid(membershipId);
  return paid >= Number(membership.plan.price);
};

module.exports = {
  round2,
  getMembershipPaid,
  getInstallmentAmount,
  validateManualPaymentAmount,
  isMembershipFullyPaid
};