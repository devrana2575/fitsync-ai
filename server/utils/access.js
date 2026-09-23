'use strict';

// Centralized trainer-scope rules for member data access.
//
// A trainer may access a member's data when:
//   1. they are that member's assigned trainer, or
//   2. the member's ACTIVE plan offers SHARED trainer support (any roster
//      trainer may coach them).
// Admins are never restricted here. These rules mirror the workout-plan
// business rule in routes/workouts.js so health/progress endpoints stay in
// lock-step with what a trainer may actually manage.

const MemberProfile = require('../models/MemberProfile');
const Membership = require('../models/Membership');
const MembershipPlan = require('../models/MembershipPlan');

const isAdmin = (role) => role === 'admin';
const isTrainer = (role) => role === 'trainer';

const canTrainerAccessMember = async (trainerId, memberId) => {
  const profile = await MemberProfile.findOne({ user: memberId }).select('assignedTrainer').lean();
  if (profile && profile.assignedTrainer && String(profile.assignedTrainer) === String(trainerId)) return true;

  const active = await Membership.findOne({ user: memberId, status: 'ACTIVE' })
    .select('plan')
    .populate('plan', 'trainerIncluded trainerAllocationMode')
    .lean();
  return Boolean(active && active.plan && active.plan.trainerIncluded && active.plan.trainerAllocationMode === 'SHARED');
};

// Reduce an arbitrary list of member ids to those a trainer may access.
// Bounded by the request's own id set so roster-wide scans are not triggered.
const filterAccessibleMemberIds = async (trainerId, ids) => {
  const list = (ids || []).filter(Boolean).map(String);
  if (list.length === 0) return [];
  const [assigned, active] = await Promise.all([
    MemberProfile.find({ assignedTrainer: trainerId, user: { $in: ids } }).select('user').lean(),
    Membership.find({ user: { $in: ids }, status: 'ACTIVE' })
      .select('user plan')
      .populate('plan', 'trainerIncluded trainerAllocationMode')
      .lean()
  ]);
  const allowed = new Set(assigned.map((p) => String(p.user)));
  for (const m of active) {
    if (m.plan && m.plan.trainerIncluded && m.plan.trainerAllocationMode === 'SHARED') allowed.add(String(m.user));
  }
  return list.filter((id) => allowed.has(id));
};

// Complete, de-duplicated set of member ids a trainer may access: members
// assigned to them plus every member holding an ACTIVE SHARED-coverage plan.
// Used for list-scoped endpoints (attendance rolls) where a membership filter
// has to be turned into a member filter.
const getTrainerAccessibleMemberIds = async (trainerId) => {
  const [assignedIds, sharedPlanIds] = await Promise.all([
    MemberProfile.find({ assignedTrainer: trainerId }).distinct('user'),
    MembershipPlan.find({ trainerIncluded: true, trainerAllocationMode: 'SHARED' }).distinct('_id')
  ]);
  const sharedUserIds = sharedPlanIds.length > 0
    ? await Membership.find({ status: 'ACTIVE', plan: { $in: sharedPlanIds } }).distinct('user')
    : [];
  return [...new Set([...assignedIds.map(String), ...sharedUserIds.map(String)])];
};

const MEDICAL_FIELDS = [
  'medicalConditions',
  'injuries',
  'medicalNotes',
  'allergies',
  'medicalRestrictions',
  'doctorRecommendation'
];

// List-context profile view. Admins keep everything; trainer-facing list
// responses never carry medical fields (sensitive, not needed on a roster).
// Detail endpoints (GET /api/members/:id) still expose medical data to the
// assigned trainer, who needs it to build safe work plans.
const sanitizeMemberProfileForViewer = (profile, viewerRole) => {
  if (!profile) return profile;
  if (viewerRole === 'admin') return profile;
  const source = profile && profile._doc ? profile._doc : profile;
  const copy = { ...source };
  for (const field of MEDICAL_FIELDS) delete copy[field];
  return copy;
};

module.exports = {
  isAdmin,
  isTrainer,
  canTrainerAccessMember,
  filterAccessibleMemberIds,
  sanitizeMemberProfileForViewer
};