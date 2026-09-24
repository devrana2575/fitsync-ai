'use strict';

const User = require('../models/User');
const TrainerProfile = require('../models/TrainerProfile');
const MemberProfile = require('../models/MemberProfile');
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
let allocationLock = Promise.resolve();
const withAllocationLock = (asyncFn) => {
  const run = allocationLock.then(asyncFn, asyncFn);
  allocationLock = run.then(() => undefined, () => undefined);
  return run;
};

// Deterministic eligibility pool, ordered by ascending workload:
//   1. Trainer with an active User account + TrainerProfile.
//   2. Profile.isAvailable is not false (absence/leave is respected).
//   3. Optional requiredSpecialization must be present in the profile.
//   4. Current assigned-member count must be below the profile maxMembers.
//   5. Two picks share a workload -> lowest member count first; tie-break by
//      name (locale) then _id so the same input always yields the same trainer.
const eligibleTrainers = async ({ requiredSpecialization }) => {
  const users = await User.find({ role: 'trainer', isActive: true }).select('_id name').lean();
  const ids = users.map((u) => u._id);
  if (ids.length === 0) return [];

  const profilesByUser = new Map(
    (await TrainerProfile.find({ user: { $in: ids } }).lean()).map((p) => [String(p.user), p])
  );

  const countsByUser = new Map(
    (await MemberProfile.aggregate([
      { $match: { assignedTrainer: { $in: ids } } },
      { $group: { _id: '$assignedTrainer', count: { $sum: 1 } } }
    ])).map((c) => [String(c._id), c.count])
  );

  const normalized = (s) => String(s || '').trim().toLowerCase();

  return users
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

// Assign (or confirm) a trainer for a membership per its plan entitlement.
//
// - Plan without trainerIncluded: clears any assignment.
// - Plan with trainer entitlement: skips when the member is already ASSIGNED
//   (unless force), otherwise picks the lowest-load eligible trainer.
// - No eligible trainer: membership remains ACTIVE but the assignment enters
//   PENDING with a reason, and admins are notified. Never blocks activation.
//
// The body runs inside the allocation mutex so capacity is never oversubscribed
// by concurrent activations (see withAllocationLock above).
const allocateTrainerForMembership = (membershipId, options) =>
  withAllocationLock(() => allocateTrainerForMembershipUnlocked(membershipId, options));

const allocateTrainerForMembershipUnlocked = async (membershipId, { force = false } = {}) => {
  const Membership = require('../models/Membership');
  const membership = await Membership.findById(membershipId).populate('plan');
  if (!membership || membership.status !== 'ACTIVE' || !membership.plan) {
    return { status: 'skipped' };
  }

  const plan = membership.plan;
  const memberId = membership.user;

  let profile = await MemberProfile.findOne({ user: memberId });
  if (!profile) {
    profile = await MemberProfile.create({ user: memberId });
  }

  if (!plan.trainerIncluded) {
    if (profile.trainerAssignmentStatus !== 'NONE') {
      const previous = profile.assignedTrainer || null;
      profile.assignedTrainer = undefined;
      profile.trainerAssignmentStatus = 'NONE';
      profile.pendingTrainerReason = undefined;
      profile.assignedAt = undefined;
      await profile.save();
      await logAudit({
        action: 'unassigned',
        entity: 'MemberProfile',
        entityId: profile._id,
        user: memberId,
        before: { assignedTrainer: previous, status: 'ASSIGNED' },
        after: { assignedTrainer: null, status: 'NONE' },
        reason: 'plan has no trainer entitlement'
      });
    }
    return { status: 'none', profile };
  }

  if (profile.trainerAssignmentStatus === 'ASSIGNED' && profile.assignedTrainer && !force) {
    return { status: 'assigned', trainerId: profile.assignedTrainer, profile };
  }

  const pool = await eligibleTrainers({ requiredSpecialization: plan.requiredSpecialization });

  if (pool.length === 0) {
    profile.assignedTrainer = undefined;
    profile.trainerAssignmentStatus = 'PENDING';
    profile.pendingTrainerReason = 'No eligible trainer is currently available for this plan';
    profile.assignedAt = undefined;
    await profile.save();
    await logAudit({
      action: 'pending',
      entity: 'MemberProfile',
      entityId: profile._id,
      user: memberId,
      after: { assignedTrainer: null, status: 'PENDING' },
      reason: 'no eligible trainer available'
    });
    await notifyAdmins(
      'Trainer allocation required',
      `A paid member on the ${plan.name} plan has no eligible trainer available. Please assign one.`,
      { membershipId: String(membershipId), memberId: String(memberId) }
    );
    return { status: 'pending', profile };
  }

  const chosen = pool[0];
  const previous = profile.assignedTrainer || null;
  profile.assignedTrainer = chosen.trainer._id;
  profile.trainerAssignmentStatus = 'ASSIGNED';
  profile.pendingTrainerReason = undefined;
  profile.assignedAt = new Date();
  await profile.save();

  await logAudit({
    action: 'assigned',
    entity: 'MemberProfile',
    entityId: profile._id,
    user: memberId,
    before: { assignedTrainer: previous, status: 'ASSIGNED' },
    after: { assignedTrainer: chosen.trainer._id, status: 'ASSIGNED' },
    reason: 'deterministic allocation',
    metadata: { plan: plan.name, trainerName: chosen.trainer.name }
  });

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

module.exports = { allocateTrainerForMembership, eligibleTrainers, clearTrainerAssignment };