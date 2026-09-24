const Membership = require('../models/Membership');
const { allocateTrainerForMembership } = require('./trainerAllocation');
const { ensurePlanSnapshot } = require('./planSnapshot');
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
//
// The one-ACTIVE-per-user invariant is enforced twice: logically here (we
// supersede competitors) and physically by the DB partial unique index on
// { user: 1 } filtered to status ACTIVE. Concurrent activations that both pass
// the read side can still collide on the ACTIVE transition; the loser of that
// race observes E11000 and reconciles competitor state before a single retry.

// Cancel every OTHER ACTIVE membership for the same user so a newly activated
// membership is never in competition for the one-ACTIVE-per-user invariant.
// Excluding the membership being activated keeps renewals of an already-ACTIVE
// record from cancelling themselves. Returns the superseded documents.
const cancelOtherActiveMemberships = async (userId, excludeMembershipId) => {
  if (!userId) return [];
  const superseded = await Membership.find(
    { user: userId, status: 'ACTIVE', _id: { $ne: excludeMembershipId } }
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
  return superseded;
};

const activateMembershipFromPayment = async (membershipId) => {
  if (!membershipId) return;
  const membership = await Membership.findById(membershipId).populate('plan');
  if (!membership || membership.status === 'ACTIVE' || membership.status === 'CANCELLED') return;

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

  // Commercial terms are frozen at (re-)activation. ensurePlanSnapshot keeps an
  // existing snapshot untouched, so re-opening an EXPIRED membership preserves
  // the terms it originally committed to (never today's live plan).
  ensurePlanSnapshot(membership, membership.plan);

  membership.status = 'ACTIVE';
  membership.activatedAt = new Date();

  await cancelOtherActiveMemberships(membership.user, membership._id);
  try {
    await membership.save();
  } catch (error) {
    // E11000: two activations for the same user raced past the read side and
    // both tried to land ACTIVE. Reconcile the competitor's state and retry the
    // ACTIVE transition exactly once; a second failure propagates.
    if (!error || error.code !== 11000) throw error;
    await cancelOtherActiveMemberships(membership.user, membership._id);
    await membership.save();
  }
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

module.exports = { activateMembershipFromPayment, cancelLinkedMembership, cancelOtherActiveMemberships };