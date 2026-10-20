'use strict';

// Sick-leave coverage engine: installs temporary replacement trainers on the
// absent trainer's ACTIVE memberships and restores the originals afterwards.
//
// Guarantees:
//  - Idempotent. Every pass is driven by current membership state (a
//    membership already wearing THIS leave's cover is skipped, one restored is
//    skipped), so approval, cancellation, cron reconcile and startup sweeps can
//    all re-run the same functions safely.
//  - Exact restoration. Each installed cover is recorded on the leave
//    (coverage.entries); restore only rewrites memberships still wearing that
//    cover. An admin who reassigned a member during the leave is never
//    silently reverted.
//  - Never blocks on capacity. If no eligible trainer exists the membership
//    keeps its original trainer, is recorded in coverage.uncovered and admins
//    are notified; a later pass retries it.
//  - All assignment writes go through recordMembershipAssignment (append-only
//    history + audit) and syncProfileMirror keeps the compatibility mirror
//    truthful.

const Membership = require('../models/Membership');
const TrainerSickLeave = require('../models/TrainerSickLeave');
const {
  recordMembershipAssignment,
  syncProfileMirror,
  assignmentOf,
  eligibleTrainers,
  withAllocationLock
} = require('./trainerAllocation');
const { getCommittedPlanTerms } = require('./paymentTerms');
const { bulkCreateNotifications } = require('./notify');
const { logAudit } = require('./audit');
const { emitToUser } = require('./socket');

const notifyAdmins = async (title, message, data = {}) => {
  const User = require('../models/User');
  const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
  if (admins.length === 0) return;
  await bulkCreateNotifications(
    admins.map((a) => ({ user: a._id, title, message, type: 'trainer_absent', data }))
  );
};

const trainerName = async (trainerId) => {
  if (!trainerId) return 'your trainer';
  const User = require('../models/User');
  const doc = await User.findById(trainerId).select('name').lean();
  return doc?.name || 'your trainer';
};

// Trainers (other than `excludeLeaveId`'s own trainer) with an APPROVED leave
// overlapping [startDate, endDate] - they must not be picked as replacements.
const overlappingLeaveTrainerIds = async ({ startDate, endDate, excludeLeaveId = null } = {}) => {
  const query = {
    status: 'APPROVED',
    startDate: { $lte: endDate },
    endDate: { $gte: startDate }
  };
  if (excludeLeaveId) query._id = { $ne: excludeLeaveId };
  const rows = await TrainerSickLeave.find(query).select('trainer').lean();
  return rows.map((r) => String(r.trainer));
};

// ---------------------------------------------------------------------------
// Install / restore
// ---------------------------------------------------------------------------

// Idempotent pass: put a temporary cover on every ACTIVE membership currently
// coached by the sick trainer that is not already covered by this leave.
const installCoversForLeave = (leave, { actor = null } = {}) =>
  withAllocationLock(async () => {
    const memberships = await Membership.find({
      status: 'ACTIVE',
      'trainerAssignment.currentTrainer': leave.trainer
    }).populate('plan');

    const exclude = await overlappingLeaveTrainerIds({
      startDate: leave.startDate,
      endDate: leave.endDate,
      excludeLeaveId: leave._id
    });
    const excludedIds = [String(leave.trainer), ...exclude.map(String)];

    const entries = (leave.coverage && Array.isArray(leave.coverage.entries)) ? leave.coverage.entries.slice() : [];
    const coveredMembershipIds = new Set(entries.map((e) => String(e.membership)));
    const uncovered = [];
    const newlyCovered = [];
    let pool = null;
    let poolCapacity = null;
    let poolLoad = null;

    for (const membership of memberships) {
      const assignment = assignmentOf(membership);
      if (!assignment.assignmentInitialized || assignment.status !== 'ASSIGNED') continue;
      if (String(assignment.currentTrainer) !== String(leave.trainer)) continue;
      // Already wearing this leave's cover - nothing to do (idempotency).
      if (assignment.sickLeave && String(assignment.sickLeave) === String(leave._id)) continue;
      // Covered by a DIFFERENT approved leave - never stack covers.
      if (assignment.temporaryReplacement && assignment.sickLeave) continue;

      const terms = getCommittedPlanTerms(membership) || membership.plan;
      if (!pool) {
        pool = await eligibleTrainers({
          requiredSpecialization: terms && terms.requiredSpecialization,
          excludeTrainerIds: excludedIds
        });
        // Live capacity tracking: every installed cover raises that trainer's
        // workload, so the pool is re-checked per membership instead of being
        // reused blindly (never oversubscribe maxMembers within one pass).
        poolCapacity = new Map(
          pool.map((p) => [String(p.trainer._id), p.profile && p.profile.maxMembers > 0 ? p.profile.maxMembers : Infinity])
        );
        poolLoad = new Map(pool.map((p) => [String(p.trainer._id), p.memberCount]));
      }
      const chosen = pool.find(({ trainer }) => {
        const id = String(trainer._id);
        if (id === String(leave.trainer)) return false;
        return (poolLoad.get(id) || 0) < (poolCapacity.get(id) ?? Infinity);
      });

      if (!chosen) {
        uncovered.push(membership._id);
        if (!coveredMembershipIds.has(String(membership._id))) {
          newlyCovered.push({ membership: membership._id, replacement: null });
        }
        continue;
      }

      await recordMembershipAssignment(membership, {
        currentTrainer: chosen.trainer._id,
        originalTrainer: assignment.originalTrainer || leave.trainer,
        status: 'ASSIGNED',
        temporaryReplacement: true,
        sickLeave: leave._id,
        reason: 'SICK_LEAVE',
        actor,
        note: 'temporary cover while original trainer is on approved sick leave'
      });
      await syncProfileMirror(membership.user);

      entries.push({ membership: membership._id, replacement: chosen.trainer._id });
      coveredMembershipIds.add(String(membership._id));
      newlyCovered.push({ membership: membership._id, replacement: chosen.trainer._id });
      const chosenId = String(chosen.trainer._id);
      poolLoad.set(chosenId, (poolLoad.get(chosenId) || 0) + 1);

      emitToUser(String(membership.user), 'membership_updated', { membershipId: String(membership._id) });
    }

    // Membership may have become uncovered (retry after pool freed up) - drop
    // stale uncovered markers for memberships that just got a real cover.
    const stillUncovered = uncovered.filter((id) => !coveredMembershipIds.has(String(id)));

    const previousInstalledAt = leave.coverage && leave.coverage.installedAt;
    leave.coverage = {
      entries: entries.filter((e) => e.replacement),
      uncovered: stillUncovered,
      installedAt: previousInstalledAt || new Date(),
      restoredAt: leave.coverage ? leave.coverage.restoredAt || null : null
    };
    await leave.save();

    const coveredWithReplacement = newlyCovered.filter((c) => c.replacement);
    if (coveredWithReplacement.length > 0) {
      const absentName = await trainerName(leave.trainer);
      const notifications = [];
      for (const c of coveredWithReplacement) {
        const replacementName = await trainerName(c.replacement);
        const membership = await Membership.findById(c.membership).select('user').lean();
        if (!membership) continue;
        notifications.push({
          user: membership.user,
          title: 'Trainer on leave - temporary cover',
          message: `${absentName} is on leave. ${replacementName} is covering your training sessions meanwhile.`,
          type: 'trainer_assignment',
          data: { sickLeaveId: String(leave._id), replacementId: String(c.replacement) }
        });
        notifications.push({
          user: c.replacement,
          title: 'Temporary cover assigned',
          message: `You are covering ${absentName}'s members while they are on leave.`,
          type: 'trainer_assignment',
          data: { sickLeaveId: String(leave._id) }
        });
      }
      await bulkCreateNotifications(notifications);
    }

    if (stillUncovered.length > 0) {
      await notifyAdmins(
        'Sick-leave cover needed',
        `${await trainerName(leave.trainer)} is on leave but ${stillUncovered.length} membership(s) have no eligible replacement trainer. Please assign one manually.`,
        { sickLeaveId: String(leave._id), memberships: stillUncovered.map(String) }
      );
    }

    await logAudit({
      actor,
      action: 'coverage_installed',
      entity: 'TrainerSickLeave',
      entityId: leave._id,
      user: leave.trainer,
      reason: 'temporary replacement installed for approved sick leave',
      metadata: {
        covered: coveredWithReplacement.length,
        uncovered: stillUncovered.length
      }
    });

    return { covered: coveredWithReplacement.length, uncovered: stillUncovered.length };
  });

// Idempotent pass: put every membership still wearing THIS leave's cover back
// to its original trainer. Memberships an admin reassigned meanwhile keep the
// admin's choice.
const restoreOriginalTrainers = (leave, { actor = null, note = '' } = {}) =>
  withAllocationLock(async () => {
    const entries = (leave.coverage && Array.isArray(leave.coverage.entries)) ? leave.coverage.entries : [];
    const absentName = await trainerName(leave.trainer);
    const restored = [];
    const skipped = [];

    for (const entry of entries) {
      const membership = await Membership.findById(entry.membership);
      if (!membership) continue;
      const assignment = assignmentOf(membership);
      if (!assignment.sickLeave || String(assignment.sickLeave) !== String(leave._id)) {
        skipped.push(membership._id); // already restored or reassigned elsewhere
        continue;
      }
      if (entry.replacement && assignment.currentTrainer
        && String(assignment.currentTrainer) !== String(entry.replacement)) {
        skipped.push(membership._id); // admin changed it during the leave - keep it
        continue;
      }

      const restoreTo = assignment.originalTrainer || leave.trainer;
      await recordMembershipAssignment(membership, {
        currentTrainer: restoreTo,
        originalTrainer: restoreTo,
        status: 'ASSIGNED',
        temporaryReplacement: false,
        sickLeave: null,
        reason: 'RETURN_FROM_LEAVE',
        actor,
        note: note || `sick leave ended - restored original trainer`
      });
      await syncProfileMirror(membership.user);
      restored.push({ membership: membership._id, trainer: restoreTo });

      emitToUser(String(membership.user), 'membership_updated', { membershipId: String(membership._id) });
      bulkCreateNotifications([{
        user: membership.user,
        title: 'Your trainer is back',
        message: `${absentName} is back from leave and is covering your sessions again.`,
        type: 'trainer_assignment',
        data: { sickLeaveId: String(leave._id), trainerId: String(restoreTo) }
      }]).catch(() => {});
    }

    leave.coverage = {
      ...(leave.coverage && leave.coverage._doc ? leave.coverage._doc : leave.coverage || {}),
      entries: entries.filter((e) => !restored.some((r) => String(r.membership) === String(e.membership))),
      uncovered: [],
      installedAt: (leave.coverage && leave.coverage.installedAt) || null,
      restoredAt: new Date()
    };
    await leave.save();

    if (restored.length > 0) {
      await logAudit({
        actor,
        action: 'coverage_restored',
        entity: 'TrainerSickLeave',
        entityId: leave._id,
        user: leave.trainer,
        reason: note || 'original trainers restored after sick leave',
        metadata: { restored: restored.length, skipped: skipped.length }
      });
    }

    return { restored: restored.length, skipped: skipped.length };
  });

// ---------------------------------------------------------------------------
// Reconcile sweep (cron + startup)
// ---------------------------------------------------------------------------

// Idempotent sweep over every leave:
//   1. APPROVED leave that already started but never finished installing its
//      covers (approving process crashed, or approval raced the clock) ->
//      install now.
//   2. APPROVED leave whose end instant passed -> restore originals and mark
//      COMPLETED.
// Safe to run concurrently with request-driven approve/cancel: all work is
// serialized through the same allocation mutex and state-checked per pass.
const reconcileSickLeaves = async ({ now = new Date() } = {}) => {
  const started = await TrainerSickLeave.find({
    status: 'APPROVED',
    startDate: { $lte: now },
    $or: [
      { 'coverage.installedAt': null },
      { 'coverage.installedAt': { $exists: false } }
    ]
  });

  let installed = 0;
  for (const leave of started) {
    const result = await installCoversForLeave(leave, { actor: leave.reviewedBy });
    installed += result.covered;
  }

  const ended = await TrainerSickLeave.find({ status: 'APPROVED', endDate: { $lte: now } });
  let restored = 0;
  for (const leave of ended) {
    const result = await restoreOriginalTrainers(leave, {
      actor: leave.reviewedBy,
      note: 'approved sick leave ended (scheduled reconcile)'
    });
    restored += result.restored;
    leave.status = 'COMPLETED';
    leave.completedAt = new Date();
    await leave.save();
  }

  if (installed > 0 || restored > 0 || started.length > 0 || ended.length > 0) {
    console.log(`[SickLeave] Reconcile: ${started.length} leave(s) installed (${installed} cover(s)), ${ended.length} completed (${restored} restored)`);
  }
  return { installed, restored, started: started.length, completed: ended.length };
};

module.exports = {
  overlappingLeaveTrainerIds,
  installCoversForLeave,
  restoreOriginalTrainers,
  reconcileSickLeaves
};
