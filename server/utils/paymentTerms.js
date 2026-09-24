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

// Number of COMPLETED payments already recorded against a membership
// (optionally excluding one payment id). Because every member payment is a
// fixed installment, this count doubles as the index of the NEXT DUE
// installment in the plan's schedule (0 = first installment still due).
const getMembershipPaymentCount = async (membershipId, excludePaymentId) => {
  const membership = toObjectId(membershipId);
  if (!membership) return 0;
  const match = { membership, status: 'COMPLETED' };
  const exclude = toObjectId(excludePaymentId);
  if (exclude) match._id = { $ne: exclude };
  return Payment.countDocuments(match);
};

// Fixed per-installment amount for an INSTALLMENT plan, or null when the plan
// is a single-payment FULL plan.
const getInstallmentAmount = (plan) =>
  plan && plan.paymentMode === 'INSTALLMENT' && plan.installments > 1
    ? Number(plan.installmentAmount)
    : null;

// The authoritative per-installment schedule of an INSTALLMENT plan as
// [{ seq, amount }], or [] when the plan has no schedule. Only trusted when
// the schedule length matches the configured installment count.
const getInstallmentSchedule = (plan) => {
  const n = Number(plan && plan.installments);
  if (!plan || plan.paymentMode !== 'INSTALLMENT' || !(n > 1)) return [];
  if (Array.isArray(plan.installmentSchedule) && plan.installmentSchedule.length === n) {
    return plan.installmentSchedule.map((entry) => ({
      seq: Number(entry.seq),
      amount: Number(entry.amount)
    }));
  }
  return [];
};

// The amount of the next due installment, indexed by the number of installments
// already COMPLETED (paidCount). Uses the stored schedule when present; falls
// back to the legacy uniform fields: the finalInstallmentAmount applies only to
// the last slot, otherwise installmentAmount. Returns null for non-INSTALLMENT
// plans.
const getNextDueInstallment = (plan, paidCount) => {
  const n = Number(plan && plan.installments);
  if (!plan || plan.paymentMode !== 'INSTALLMENT' || !(n > 1)) return null;
  const index = Math.max(0, Number(paidCount) || 0);
  const schedule = getInstallmentSchedule(plan);
  if (schedule.length === n) {
    const entry = schedule[index] || schedule[schedule.length - 1];
    return entry ? entry.amount : null;
  }
  return Number(plan.finalInstallmentAmount) > 0 && index === n - 1
    ? Number(plan.finalInstallmentAmount)
    : Number(plan.installmentAmount);
};

// Validate a manual (counter/cash/UPI/bank-transfer) payment amount against the
// plan's payment configuration.
//
// FULL plans:      a COMPLETED payment must equal the plan price exactly. No
//                  cumulative check - multiple full payments are legitimate
//                  (renewals / advance terms), matching prior behaviour.
// INSTALLMENT plans: an INSTALLMENT plan is always paid OFF-LINE (gym counter /
//                  cash / UPI) — online gateways charge the full price and are
//                  never validated here. Each COMPLETED manual payment must
//                  equal the NEXT DUE installment from the exact schedule (the
//                  remainder sits in the FINAL installment, so the schedule
//                  sums exactly to the plan price) and must not push the
//                  cumulative paid total past the plan price (overpayment
//                  rejected).
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
    const n = Number(plan.installments);
    const schedule = getInstallmentSchedule(plan);
    const paidCount = await getMembershipPaymentCount(membershipId, excludePaymentId);
    const due = getNextDueInstallment(plan, paidCount);
    if (value !== due) {
      const base = schedule.length ? schedule[0].amount : Number(plan.installmentAmount);
      const final = schedule.length ? schedule[schedule.length - 1].amount : Number(plan.finalInstallmentAmount);
      const uniform = schedule.length > 0 && schedule.every((e) => e.amount === base);
      const error = uniform
        ? `This plan is paid in fixed installments of ₹${base} (${n} × ₹${base}). Partial amounts are not accepted.`
        : `This plan is paid in fixed installments of ₹${base} with a final installment of ₹${final} (${n} installments). The next due installment is ₹${due}. Partial amounts are not accepted.`;
      return { error };
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
  getMembershipPaymentCount,
  getInstallmentAmount,
  getInstallmentSchedule,
  getNextDueInstallment,
  validateManualPaymentAmount,
  isMembershipFullyPaid
};