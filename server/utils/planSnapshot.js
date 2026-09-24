'use strict';

// Commercial-terms snapshot for a Membership.
//
// A membership is a financial contract: once a member commits to a plan the
// commercial terms they agreed to must never change retroactively just because
// an admin later edits the MembershipPlan (price, duration, installment
// schedule, included trainer). Every Membership stores the plan terms that
// applied at creation time in `planSnapshot`; payouts, installment coverage and
// "remaining" calculations read the snapshot, NOT the live plan, so historical
// financials stay immutable. Only memberships created before this field existed
// fall back to the live plan.

const toPlanTerms = (plan) => {
  if (!plan || !plan._id) return null;
  return {
    plan: plan._id,
    name: plan.name || '',
    price: Number(plan.price) || 0,
    duration: Number(plan.duration) || 0,
    paymentMode: plan.paymentMode || 'FULL',
    installments: Number(plan.installments) || 1,
    installmentAmount: Number(plan.installmentAmount) || 0
  };
};

// Build a snapshot object for storage on a Membership. `plan` may be a document
// or a lean object, populated or not, as long as it exposes the terms.
const buildPlanSnapshot = (plan) => {
  const terms = toPlanTerms(plan);
  if (!terms) return null;
  return { ...terms, snapshotAt: new Date() };
};

// Attach the snapshot to a membership document unless one already exists (a
// membership keeps the terms it was created against - activation of an EXPIRED
// membership reopens it under the ORIGINAL commercial terms, never today's).
const ensurePlanSnapshot = (membershipDoc, plan) => {
  if (!membershipDoc) return null;
  if (membershipDoc.planSnapshot && membershipDoc.planSnapshot.name) return membershipDoc.planSnapshot;
  const snapshot = buildPlanSnapshot(plan);
  if (snapshot) {
    membershipDoc.planSnapshot = snapshot;
    membershipDoc.markModified('planSnapshot');
  }
  return snapshot;
};

module.exports = { buildPlanSnapshot, ensurePlanSnapshot };