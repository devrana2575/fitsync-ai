'use strict';

// Single source of truth for the enriched membership payload shown on the
// member's "My Membership" page and the admin membership detail. Computes
// derived facts (days remaining, progress %, paid vs pending, trainer block)
// from the actual documents - nothing is faked or client-supplied.

const Payment = require('../models/Payment');
const MemberProfile = require('../models/MemberProfile');
const TrainerProfile = require('../models/TrainerProfile');
const User = require('../models/User');

const DAY_MS = 24 * 60 * 60 * 1000;

const toMembershipId = (id) => (id ? `FS-${String(id).slice(-8).toUpperCase()}` : null);

const buildTrainerBlock = async ({ userId, assignedTrainerId, profile }) => {
  const assignmentStatus = profile ? profile.trainerAssignmentStatus : null;
  const assignedAt = profile ? profile.assignedAt : null;
  const trainerId = assignedTrainerId || profile?.assignedTrainer;
  if (!trainerId) return { trainer: null, assignmentStatus, assignedAt };
  const [trainerUser, trainerProfile] = await Promise.all([
    User.findById(trainerId).select('name email avatar isActive').lean(),
    TrainerProfile.findOne({ user: trainerId })
      .select('specializations experience workingDays workingHours isAvailable')
      .lean()
  ]);
  return {
    trainer: trainerUser ? { ...trainerUser, profile: trainerProfile || null } : null,
    assignmentStatus,
    assignedAt
  };
};

const serializeMembership = async (membershipRaw, { withPayments = false } = {}) => {
  if (!membershipRaw) return null;
  // Work on the populated lean/document object regardless of input shape.
  const m = membershipRaw && membershipRaw._doc ? membershipRaw._doc : membershipRaw;
  const id = m._id || membershipRaw._id;
  const livePlan = (m.plan && m.plan._doc) ? m.plan._doc : (m.plan || null);
  const start = m.startDate ? new Date(m.startDate) : null;
  const end = m.endDate ? new Date(m.endDate) : null;
  const now = new Date();

  // Commercial terms (name/price/duration/payment schedule) AND the service
  // entitlements (trainer included / allocation mode / specialization /
  // workout plan) come from the immutable planSnapshot captured at purchase
  // time when present. A plan edit afterwards must not rewrite what the member
  // committed to, for either billing or trainer service. Legacy rows without a
  // snapshot fall back to the live plan; their historical terms cannot be
  // reconstructed, so they keep current-plan behaviour by design.
  // A real snapshot always carries the plan name (built by
  // utils/planSnapshot); a default/empty subdoc or legacy row without one
  // must fall back to the live plan.
  const snapshot = m.planSnapshot && m.planSnapshot.name ? m.planSnapshot : null;
  const sourcePlan = livePlan || {};
  const has = (v) => v !== undefined && v !== null;
  const plan = snapshot
    ? {
      ...sourcePlan,
      name: snapshot.name || sourcePlan.name,
      price: has(snapshot.price) ? snapshot.price : sourcePlan.price,
      duration: has(snapshot.duration) ? snapshot.duration : sourcePlan.duration,
      paymentMode: snapshot.paymentMode || sourcePlan.paymentMode,
      installments: has(snapshot.installments) ? snapshot.installments : sourcePlan.installments,
      installmentAmount: has(snapshot.installmentAmount) ? snapshot.installmentAmount : sourcePlan.installmentAmount,
      finalInstallmentAmount: has(snapshot.finalInstallmentAmount) ? snapshot.finalInstallmentAmount : sourcePlan.finalInstallmentAmount,
      installmentSchedule: Array.isArray(snapshot.installmentSchedule) ? snapshot.installmentSchedule : sourcePlan.installmentSchedule,
      features: Array.isArray(snapshot.features) ? snapshot.features : sourcePlan.features,
      trainerIncluded: has(snapshot.trainerIncluded) ? snapshot.trainerIncluded : sourcePlan.trainerIncluded,
      trainerAllocationMode: snapshot.trainerAllocationMode || sourcePlan.trainerAllocationMode,
      requiredSpecialization: snapshot.requiredSpecialization || sourcePlan.requiredSpecialization,
      workoutPlanIncluded: has(snapshot.workoutPlanIncluded) ? snapshot.workoutPlanIncluded : sourcePlan.workoutPlanIncluded
    }
    : sourcePlan;
  const price = Number(plan.price) || 0;

  const durationDays = start && end ? Math.max(0, Math.round((end - start) / DAY_MS)) : null;
  const daysRemaining = end ? Math.max(0, Math.ceil((end - now) / DAY_MS)) : null;
  const progressPercent = start && end && end > start
    ? Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)))
    : (m.status === 'ACTIVE' ? 100 : 0);

  let payments = [];
  let paidTotal = 0;
  let pendingTotal = 0;
  let paymentStatus = 'UNPAID';

  if (withPayments) {
    payments = await Payment.find({ membership: id })
      .select('amount method status date transactionId gateway gatewayPaymentId gatewayOrderId notes')
      .sort({ date: -1 })
      .lean();
    for (const p of payments) {
      if (p.status === 'COMPLETED') paidTotal += Number(p.amount) || 0;
      else if (p.status === 'PENDING') pendingTotal += Number(p.amount) || 0;
    }
    if (price > 0 && paidTotal >= price) paymentStatus = 'PAID';
    else if (payments.some((p) => p.status === 'COMPLETED')) paymentStatus = 'PARTIAL';
  }

  const ownerUserId = m.user && m.user._id ? m.user._id : m.user;
  const ownerProfile = ownerUserId
    ? await MemberProfile.findOne({ user: ownerUserId }).select('assignedTrainer trainerAssignmentStatus assignedAt pendingTrainerReason').lean()
    : null;
  const premium = await buildTrainerBlock({ userId: ownerUserId, profile: ownerProfile });

  return {
    ...m,
    _id: String(id),
    membershipId: toMembershipId(id),
    plan,
    startDate: m.startDate,
    endDate: m.endDate,
    status: m.status,
    autoRenew: Boolean(m.autoRenew),
    activatedAt: m.activatedAt || null,
    durationDays,
    daysRemaining,
    progressPercent,
    payments,
    paidTotal,
    pendingTotal,
    remaining: Math.max(price - paidTotal, 0),
    paymentStatus,
    trainerEntitlement: plan ? {
      trainerIncluded: Boolean(plan.trainerIncluded),
      trainerAllocationMode: plan.trainerAllocationMode || 'NONE',
      workoutPlanIncluded: Boolean(plan.workoutPlanIncluded),
      requiredSpecialization: plan.requiredSpecialization || null
    } : null,
    trainer: premium.trainer,
    trainerAssignmentStatus: premium.assignmentStatus,
    trainerAssignedAt: premium.assignedAt
  };
};

module.exports = { serializeMembership };