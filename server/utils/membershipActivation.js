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
// - activates ONLY the targeted membership; a member may hold several ACTIVE
//   memberships at once and activation never touches sibling rows
// - re-opens an EXPIRED / stale membership with a fresh window computed from
//   the COMMITTED plan duration (snapshot first, live plan for legacy rows)
// - after activation, applies the plan's trainer entitlement to THIS
//   membership via the deterministic allocation service. Allocation can never
//   block activation: no eligible trainer results in a PENDING assignment.

const activateMembershipFromPayment = async (membershipId) => {
  if (!membershipId) return;
  const membership = await Membership.findById(membershipId).populate('plan');
  if (!membership || membership.status === 'ACTIVE' || membership.status === 'CANCELLED') return;

  const now = new Date();
  if (membership.status === 'EXPIRED' || !membership.endDate || membership.endDate <= now) {
    const start = new Date();
    const end = new Date(start);
    // Re-open window is computed from the COMMITTED duration (snapshot first).
    // Legacy rows without a snapshot fall back to the live plan duration - the
    // historical terms cannot be reconstructed, so they keep current-plan
    // behaviour by design. Activation never invents a snapshot.
    const committed = membership.planSnapshot && membership.planSnapshot.name ? membership.planSnapshot : membership.plan;
    if (committed && committed.duration) {
      end.setDate(end.getDate() + committed.duration);
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
// the admin refund flow and the gateway refund webhook alike. Cancels ONLY the
// membership linked to that payment, never a sibling membership.
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
