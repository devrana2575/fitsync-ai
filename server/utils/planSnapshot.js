'use strict';

// Commercial-terms snapshot for a Membership.
//
// A membership is a financial contract: once a member commits to a plan the
// commercial terms they agreed to must never change retroactively just because
// an admin later edits the MembershipPlan (price, duration, installment
// schedule, included trainer, workout entitlement). Every Membership stores the
// plan terms that applied at CREATION time in `planSnapshot`; payouts,
// installment coverage, "remaining" calculations and trainer entitlement read
// the snapshot, NOT the live plan, so historical service contracts stay
// immutable. Only memberships created before this field existed (legacy rows)
// fall back to the live plan; their historical terms cannot be reconstructed,
// so they keep current-plan behaviour (documented limitation).
//
// The snapshot deliberately captures the member's purchased commercial/service
// contract (plan ref, name, price, duration, payment mode, installments,
// schedule, included features and trainer/workout entitlements). Administrative
// plan fields (isActive, timestamps, indexes, description text) are not
// "purchased entitlements" and are NOT frozen.

const toPlanTerms = (plan) => {
  if (!plan || !plan._id) return null;
  const schedule = Array.isArray(plan.installmentSchedule)
    ? plan.installmentSchedule.map((e) => ({
        seq: Number(e && e.seq),
        amount: Number(e && e.amount)
      }))
    : [];
  return {
    plan: plan._id,
    name: plan.name || '',
    price: Number(plan.price) || 0,
    duration: Number(plan.duration) || 0,
    paymentMode: plan.paymentMode || 'FULL',
    installments: Number(plan.installments) || 1,
    installmentAmount: Number(plan.installmentAmount) || 0,
    finalInstallmentAmount: Number(plan.finalInstallmentAmount) || 0,
    installmentSchedule: schedule,
    features: Array.isArray(plan.features) ? plan.features.map((f) => String(f)) : [],
    trainerIncluded: Boolean(plan.trainerIncluded),
    trainerAllocationMode: plan.trainerAllocationMode || 'NONE',
    requiredSpecialization: plan.requiredSpecialization || '',
    workoutPlanIncluded: Boolean(plan.workoutPlanIncluded)
  };
};

// Build a snapshot object for storage on a Membership. `plan` may be a document
// or a lean object, populated or not, as long as it exposes the terms.
const buildPlanSnapshot = (plan) => {
  const terms = toPlanTerms(plan);
  if (!terms) return null;
  return { ...terms, snapshotAt: new Date() };
};

// Attach the snapshot to a membership document UNLESS one exists (a membership
// keeps the terms it was created against - re-opening an existing membership
// preserves the ORIGINAL commercial terms, never today's). Used only by the
// explicit admin re-commit flows (renewal / reactivation) and as the legacy
// fallback. Never overwrites an existing snapshot.
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