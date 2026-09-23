const Membership = require('../models/Membership');
const { allocateTrainerForMembership } = require('./trainerAllocation');
const { logAudit } = require('./audit');

// Authoritative membership-activation path. Every legitimate paid activation
// funnels through here so that ACTIVE membership can only result from a
// completed payment (or an explicit admin-authorized complimentary flow).
//
// Behaviour:
// - no-op when the membership is already ACTIVE (renewals are date-rolled
//   separately) or CANCELLED
// - cancels any other ACTIVE membership for the same user
// - re-opens an EXPIRED / stale membership with a fresh window computed from
//   the plan duration
// - after activation, applies the plan's trainer entitlement via the
//   deterministic allocation service. Allocation can never block activation:
//   no eligible trainer results in a PENDING assignment, not a failed flow.
const activateMembershipFromPayment = async (membershipId) => {
  if (!membershipId) return;
  const membership = await Membership.findById(membershipId).populate('plan');
  if (!membership || membership.status === 'ACTIVE' || membership.status === 'CANCELLED') return;

  const superseded = await Membership.find(
    { user: membership.user, status: 'ACTIVE', _id: { $ne: membership._id } }
  ).select('_id user status');
  for (const other of superseded) {
    other.status = 'CANCELLED';
    await other.save();
    await logAudit({
      action: 'cancelled',
      entity: 'Membership',
      entityId: other._id,
      user: other.user,
      reason: 'superseded by a new active membership'
    });
  }

  const now = new Date();
  if (membership.status === 'EXPIRED' || !membership.endDate || membership.endDate <= now) {
    const start = new Date();
    const end = new Date(start);
    if (membership.plan && membership.plan.duration) {
      end.setDate(end.getDate() + membership.plan.duration);
    }
    membership.startDate = start;
    membership.endDate = end;
  }
  membership.status = 'ACTIVE';
  membership.activatedAt = new Date();
  await membership.save();
  await logAudit({
    action: 'activated',
    entity: 'Membership',
    entityId: membership._id,
    user: membership.user,
    reason: 'payment-verified activation / complimentary / renewal',
    metadata: { plan: membership.plan ? String(membership.plan._id || membership.plan) : null }
  });

  try {
    await allocateTrainerForMembership(membership._id);
  } catch (error) {
    // Trainer allocation is a best-effort entitlement follow-up. A failure
    // here must not roll back an already-completed activation.
    console.error('trainer allocation failed after activation', error);
  }
};

// Revoke access when a payment is refunded. Idempotent - safe to call from
// the admin refund flow and the gateway refund webhook alike.
const cancelLinkedMembership = async (membershipId) => {
  if (!membershipId) return;
  const membership = await Membership.findByIdAndUpdate(
    membershipId,
    { status: 'CANCELLED' },
    { new: true }
  );
  if (membership) {
    await logAudit({
      action: 'cancelled',
      entity: 'Membership',
      entityId: membership._id,
      user: membership.user,
      reason: 'payment refunded - access revoked'
    });
  }
};

module.exports = { activateMembershipFromPayment, cancelLinkedMembership };