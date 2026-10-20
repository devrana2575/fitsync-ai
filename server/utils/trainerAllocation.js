'use strict';

const User = require('../models/User');
const TrainerProfile = require('../models/TrainerProfile');
const MemberProfile = require('../models/MemberProfile');
const Membership = require('../models/Membership');
const Notification = require('../models/Notification');
const { logAudit } = require('./audit');

const notifyAdmins = async (title, message, data = {}) => {
  const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
  if (admins.length === 0) return;
  await Notification.insertMany(
    admins.map((a) => ({ user: a._id, title, message, type: 'trainer_assignment', data }))
  );
};

// In-process promise-based mutex. The whole allocation critical section (from
// reading/creating the MemberProfile through choosing the trainer and saving)
// runs inside `withAllocationLock`, so concurrent activations serialize into a
// single queue and every caller recomputes the eligibility pool fresh AFTER the
// previous assignment is committed. This prevents two simultaneous activations
// from both observing memberCount 0 and both picking the same trainer past
// maxMembers. The chain tolerates failures (one rejection must not deadlock or
// poison the queue).
// NOTE: this is an in-process guard only. Cross-instance safety comes from the
// conditional (status-guarded) updates used by the sick-leave coverage writer.
let allocationLock = Promise.resolve();
const withAllocationLock = (asyncFn) => {
  const run = allocationLock.then(asyncFn, asyncFn);
  allocationLock = run.then(() => undefined, () => undefined);
  return run;
};

// ---------------------------------------------------------------------------
// Membership-level assignment writes (single writer for ALL assignment flows)
// ---------------------------------------------------------------------------

const assignmentOf = (membershipDoc) => {
  const m = membershipDoc && membershipDoc._doc ? membershipDoc._doc : membershipDoc;
  return (m && m.trainerAssignment) || {};
};

const pushHistory = (membershipDoc, entry) => {
  const current = membershipDoc.trainerAssignment || {};
  const history = Array.isArray(current.history) ? current.history.slice() : [];
  history.push({ ...entry, at: entry.at || new Date() });
  membershipDoc.trainerAssignment = { ...current, history };
  membershipDoc.markModified('trainerAssignment');
};

// Write a membership-level assignment transition. Handles INITIAL, ADMIN_CHANGE,
// SICK_LEAVE and RETURN_FROM_LEAVE. Returns the saved membership doc.
const recordMembershipAssignment = async (membershipDoc, {
  currentTrainer = null,
  originalTrainer = null,
  status = 'ASSIGNED',
  pendingReason = '',
  temporaryReplacement = false,
  sickLeave = null,
  reason = 'ADMIN_CHANGE',
  actor = null,
  note = ''
} = {}) => {
  const previous = assignmentOf(membershipDoc).currentTrainer || null;
  const now = new Date();
  membershipDoc.trainerAssignment = {
    ...(membershipDoc.trainerAssignment && membershipDoc.trainerAssignment._doc ? membershipDoc.trainerAssignment._doc : membershipDoc.trainerAssignment || {}),
    assignmentInitialized: true,
    originalTrainer: originalTrainer || null,
    currentTrainer: currentTrainer || null,
    status,
    pendingReason: pendingReason || '',
    temporaryReplacement: Boolean(temporaryReplacement),
    sickLeave: sickLeave || null,
    assignedAt: currentTrainer ? ((assignmentOf(membershipDoc).assignedAt) || now) : null,
    updatedAt: now
  };
  membershipDoc.markModified('trainerAssignment');
  pushHistory(membershipDoc, {
    previousTrainer: previous,
    newTrainer: currentTrainer || null,
    reason,
    sickLeave: sickLeave || null,
    actor,
    note
  });
  await membershipDoc.save();
  await logAudit({
    actor,
    user: membershipDoc.user,
    action: status === 'ASSIGNED' ? 'assigned' : status === 'PENDING' ? 'pending' : 'unassigned',
    entity: 'Membership',
    entityId: membershipDoc._id,
    before: { trainer: previous },
    after: { trainer: currentTrainer || null, status, temporaryReplacement: Boolean(temporaryReplacement) },
    reason: note || reason,
    metadata: { reason, sickLeave: sickLeave ? String(sickLeave) : null }
  });
  return membershipDoc;
};

// Derive the single MemberProfile compatibility mirror from the member's
// membership-level assignments so the two representations never silently
// contradict each other. The mirror points at the most recently assigned
// currentTrainer across the member's memberships that carry an initialized
// assignment (latest wins, so a sick-leave cover is reflected too).
const syncProfileMirror = async (memberId) => {
  if (!memberId) return null;
  const memberships = await Membership.find({
    user: memberId,
    'trainerAssignment.assignmentInitialized': true
  })
    .select('trainerAssignment status endDate')
    .sort({ updatedAt: -1 })
    .lean();

  let profile = await MemberProfile.findOne({ user: memberId });
  if (!profile) profile = new MemberProfile({ user: memberId });

  const assigned = memberships.find((m) => m.trainerAssignment.status === 'ASSIGNED' && m.trainerAssignment.currentTrainer);
  const pending = memberships.find((m) => m.trainerAssignment.status === 'PENDING');
  const none = memberships.length > 0 && !assigned && !pending;

  if (assigned) {
    const t = assigned.trainerAssignment;
    const same = profile.assignedTrainer && String(profile.assignedTrainer) === String(t.currentTrainer);
    profile.assignedTrainer = t.currentTrainer;
    profile.trainerAssignmentStatus = 'ASSIGNED';
    profile.pendingTrainerReason = undefined;
    if (!same) profile.assignedAt = t.assignedAt || new Date();
  } else if (pending) {
    profile.assignedTrainer = undefined;
    profile.trainerAssignmentStatus = 'PENDING';
    profile.pendingTrainerReason = pending.trainerAssignment.pendingReason || 'No eligible trainer is currently available for this plan';
    profile.assignedAt = undefined;
  } else if (none) {
    profile.assignedTrainer = undefined;
    profile.trainerAssignmentStatus = 'NONE';
    profile.pendingTrainerReason = undefined;
    profile.assignedAt = undefined;
  }
  await profile.save();
  return profile;
};

// ---------------------------------------------------------------------------
// Eligibility pool
// ---------------------------------------------------------------------------

// Workload = distinct members assigned at profile level OR at membership
// level (both representations are kept in sync; the union is the safe
// capacity signal for multi-membership members).
const trainerWorkload = async (trainerIds) => {
  const ids = (trainerIds || []).map((t) => (t && t._id ? t._id : t));
  if (ids.length === 0) return new Map();
  const [profileCounts, membershipCounts] = await Promise.all([
    MemberProfile.aggregate([
      { $match: { assignedTrainer: { $in: ids } } },
      { $group: { _id: { trainer: '$assignedTrainer', member: '$user' } } }
    ]),
    Membership.aggregate([
      { $match: { 'trainerAssignment.assignmentInitialized': true, 'trainerAssignment.status': 'ASSIGNED', 'trainerAssignment.currentTrainer': { $in: ids }, status: { $in: ['ACTIVE', 'SUSPENDED', 'PENDING'] } } },
      { $group: { _id: { trainer: '$trainerAssignment.currentTrainer', member: '$user' } } }
    ])
  ]);
  const pairs = new Set();
  for (const row of [...profileCounts, ...membershipCounts]) {
    pairs.add(`${String(row._id.trainer)}:${String(row._id.member)}`);
  }
  const counts = new Map();
  for (const pair of pairs) {
    const trainer = pair.split(':')[0];
    counts.set(trainer, (counts.get(trainer) || 0) + 1);
  }
  return counts;
};

// Deterministic eligibility pool, ordered by ascending workload:
//   1. Trainer with an active User account + TrainerProfile.
//   2. Profile.isAvailable is not false (absence/leave is respected).
//   3. Not in `excludeTrainerIds` (e.g. trainers on approved sick leave
//      overlapping the coverage period).
//   4. Optional requiredSpecialization must be present in the profile.
//   5. Workload (union of profile mirror + membership-level assignments)
//      below the profile maxMembers.
//   6. Ties: lowest member count, then name, then _id - stable output.
const eligibleTrainers = async ({ requiredSpecialization, excludeTrainerIds = [] } = {}) => {
  const users = await User.find({ role: 'trainer', isActive: true }).select('_id name').lean();
  const ids = users.map((u) => u._id);
  if (ids.length === 0) return [];
  const excluded = new Set(excludeTrainerIds.map(String));

  const profilesByUser = new Map(
    (await TrainerProfile.find({ user: { $in: ids } }).lean()).map((p) => [String(p.user), p])
  );

  // Workload computed once from profile + membership assignments (see
  // trainerWorkload).
  const countsByUser = await trainerWorkload(ids);

  const normalized = (s) => String(s || '').trim().toLowerCase();

  return users
    .filter((trainer) => !excluded.has(String(trainer._id)))
    .map((trainer) => ({
      trainer,
      profile: profilesByUser.get(String(trainer._id)) || null,
      memberCount: countsByUser.get(String(trainer._id)) || 0
    }))
    .filter(({ profile }) => profile)
    .filter(({ profile }) => profile.isAvailable !== false)
    .filter(({ profile }) => {
      if (!requiredSpecialization) return true;
      const wanted = normalized(requiredSpecialization);
      return (profile.specializations || []).some((s) => normalized(s) === wanted);
    })
    .filter(({ profile, memberCount }) => {
      const max = profile.maxMembers > 0 ? profile.maxMembers : Infinity;
      return memberCount < max;
    })
    .sort((a, b) => {
      if (a.memberCount !== b.memberCount) return a.memberCount - b.memberCount;
      const na = a.trainer.name || '';
      const nb = b.trainer.name || '';
      if (na !== nb) return na.localeCompare(nb);
      return String(a.trainer._id).localeCompare(String(b.trainer._id));
    });
};

// ---------------------------------------------------------------------------
// Initial / re-allocation per membership entitlement
// ---------------------------------------------------------------------------

// Assign (or confirm) a trainer for a membership per its plan entitlement.
//
// - Plan without trainerIncluded: records an initialized NONE assignment.
// - Plan with trainer entitlement: skips when this membership already has an
//   ASSIGNED trainer (unless force), otherwise picks the lowest-load eligible
//   trainer.
// - No eligible trainer: membership remains ACTIVE but the assignment enters
//   PENDING with a reason, and admins are notified. Never blocks activation.
//
// Runs inside the allocation mutex so capacity is never oversubscribed by
// concurrent activations within this process.
const allocateTrainerForMembership = (membershipId, options) =>
  withAllocationLock(() => allocateTrainerForMembershipUnlocked(membershipId, options));

const allocateTrainerForMembershipUnlocked = async (membershipId, { force = false } = {}) => {
  const { getCommittedPlanTerms } = require('./paymentTerms');
  const membership = await Membership.findById(membershipId).populate('plan');
  if (!membership || membership.status !== 'ACTIVE' || !membership.plan) {
    return { status: 'skipped' };
  }

  // Trainer entitlement comes from the plan terms the member COMMITTED to (the
  // frozen planSnapshot), never the live plan - an admin editing the plan after
  // purchase cannot add or revoke a paid trainer. Legacy rows without a
  // snapshot keep current-plan behaviour by design.
  const plan = getCommittedPlanTerms(membership) || membership.plan;
  const memberId = membership.user;
  const current = assignmentOf(membership);

  if (!plan.trainerIncluded) {
    if (!current.assignmentInitialized || current.status !== 'NONE') {
      await recordMembershipAssignment(membership, {
        status: 'NONE',
        reason: 'ADMIN_CHANGE',
        note: 'plan has no trainer entitlement'
      });
    }
    const profile = await syncProfileMirror(memberId);
    return { status: 'none', profile };
  }

  // Idempotent: an existing initialized ASSIGNED membership keeps its trainer.
  if (current.assignmentInitialized && current.status === 'ASSIGNED' && current.currentTrainer && !force) {
    const profile = await syncProfileMirror(memberId);
    return { status: 'assigned', trainerId: current.currentTrainer, profile };
  }
  // A cover installed by an approved sick leave is never replaced by a plain
  // (re)allocation - restoration is the only writer that may move it.
  if (current.assignmentInitialized && current.temporaryReplacement && current.sickLeave && !force) {
    const profile = await syncProfileMirror(memberId);
    return { status: 'assigned', trainerId: current.currentTrainer, profile };
  }

  // An assignment already sitting on the member's profile (admin manual
  // assignment made BEFORE this membership existed) wins over pool selection:
  // buying or renewing a plan must never silently swap the member's designated
  // trainer for whoever happens to have the lowest load right now.
  const MemberProfileModel = MemberProfile;
  const profileDoc = await MemberProfileModel.findOne({ user: memberId })
    .select('assignedTrainer trainerAssignmentStatus')
    .lean();
  let chosen = null;
  if (profileDoc && profileDoc.assignedTrainer && profileDoc.trainerAssignmentStatus === 'ASSIGNED') {
    const preferredUser = await User.findById(profileDoc.assignedTrainer).select('_id isActive').lean();
    if (preferredUser && preferredUser.isActive) {
      chosen = { trainer: preferredUser };
    }
  }

  if (!chosen) {
    const pool = await eligibleTrainers({ requiredSpecialization: plan.requiredSpecialization });

    if (pool.length === 0) {
      await recordMembershipAssignment(membership, {
        status: 'PENDING',
        pendingReason: 'No eligible trainer is currently available for this plan',
        originalTrainer: current.originalTrainer || null,
        reason: 'INITIAL',
        note: 'no eligible trainer available'
      });
      const profile = await syncProfileMirror(memberId);
      await notifyAdmins(
        'Trainer allocation required',
        `A paid member on the ${plan.name} plan has no eligible trainer available. Please assign one.`,
        { membershipId: String(membershipId), memberId: String(memberId) }
      );
      return { status: 'pending', profile };
    }
    chosen = pool[0];
  }
  await recordMembershipAssignment(membership, {
    currentTrainer: chosen.trainer._id,
    originalTrainer: chosen.trainer._id,
    status: 'ASSIGNED',
    reason: 'INITIAL',
    note: 'deterministic allocation',
    actor: null
  });
  const profile = await syncProfileMirror(memberId);

  await Promise.all([
    Notification.create({
      user: memberId,
      title: 'Trainer assigned',
      message: `Your trainer is ${chosen.trainer.name} as part of the ${plan.name} plan.`,
      type: 'trainer_assignment'
    }),
    Notification.create({
      user: chosen.trainer._id,
      title: 'New member assigned',
      message: `You have been assigned as the trainer for a member on the ${plan.name} plan.`,
      type: 'trainer_assignment'
    })
  ]);

  return { status: 'assigned', trainerId: chosen.trainer._id, profile };
};

const clearTrainerAssignment = async (userId) => {
  const profile = await MemberProfile.findOne({ user: userId });
  if (!profile || profile.trainerAssignmentStatus === 'NONE') return;
  profile.assignedTrainer = undefined;
  profile.trainerAssignmentStatus = 'NONE';
  profile.pendingTrainerReason = undefined;
  profile.assignedAt = undefined;
  await profile.save();
};

module.exports = {
  allocateTrainerForMembership,
  eligibleTrainers,
  clearTrainerAssignment,
  recordMembershipAssignment,
  syncProfileMirror,
  assignmentOf,
  trainerWorkload,
  withAllocationLock
};
