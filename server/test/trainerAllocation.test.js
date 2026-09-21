'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, request, registerMember, adminContext, uniqueEmail } = require('./helpers');

const User = require('../models/User');
const TrainerProfile = require('../models/TrainerProfile');
const MemberProfile = require('../models/MemberProfile');
const Notification = require('../models/Notification');
const { allocateTrainerForMembership } = require('../utils/trainerAllocation');

let baseUrl;
before(async () => {
  ({ baseUrl } = await setup());
});
after(teardown);

let counter = 0;
const uniqueName = (base) => `${base} ${++counter} (${Date.now()})`;

const createPlan = async (token, over = {}) => {
  const res = await request('POST', '/api/membership-plans', {
    token,
    body: { name: uniqueName('Plan'), price: 1000, duration: 30, ...over },
  });
  assert.equal(res.status, 201, res.body && res.body.message);
  return res.body.plan;
};

const makeTrainer = async ({ name, specializations = [], maxMembers = 20, isAvailable = true, isActive = true } = {}) => {
  const user = await User.create({ name, email: uniqueEmail('trainer'), password: 'Trainer@123', role: 'trainer', isActive });
  await TrainerProfile.create({ user: user._id, phone: '9876543210', specializations, maxMembers, isAvailable });
  return user;
};

const activatePlan = async (token, member, plan) => {
  const res = await request('POST', '/api/payments', {
    token,
    body: { userId: member.user.id, planId: plan._id, amount: plan.price, method: 'cash', status: 'COMPLETED' },
  });
  assert.equal(res.status, 201, res.body && res.body.message);
  const my = await request('GET', '/api/memberships/my', { token: member.token });
  return my.body.memberships[0];
};

test('activation with trainer entitlement assigns a trainer deterministically (lowest load)', async () => {
  const { token } = await adminContext();
  const alice = await makeTrainer({ name: 'Alice' });
  const bob = await makeTrainer({ name: 'Bob' });
  const plan = await createPlan(token, { trainerIncluded: true, trainerAllocationMode: 'ASSIGNED' });

  const member = await registerMember();
  const membership = await activatePlan(token, member, plan);

  const profile = await MemberProfile.findOne({ user: member.user.id });
  assert.equal(profile.trainerAssignmentStatus, 'ASSIGNED');
  // Both trainers are at zero load; the deterministic tie-break is name order.
  assert.equal(String(profile.assignedTrainer), String(alice._id));

  const second = await registerMember();
  await activatePlan(token, second, plan);
  const profile2 = await MemberProfile.findOne({ user: second.user.id });
  assert.equal(profile2.trainerAssignmentStatus, 'ASSIGNED');
  assert.equal(String(profile2.assignedTrainer), String(bob._id), 'lowest-load trainer wins next');

  const third = await registerMember();
  await activatePlan(token, third, plan);
  const profile3 = await MemberProfile.findOne({ user: third.user.id });
  assert.equal(String(profile3.assignedTrainer), String(alice._id));
});

test('requiredSpecialization filters the eligible pool', async () => {
  const { token } = await adminContext();
  const alice = await makeTrainer({ name: 'Alice', specializations: ['Strength'] });
  const bob = await makeTrainer({ name: 'Bob', specializations: ['Weight Loss'] });
  const plan = await createPlan(token, {
    trainerIncluded: true,
    requiredSpecialization: 'Weight Loss',
    trainerAllocationMode: 'ASSIGNED',
  });

  const member = await registerMember();
  await activatePlan(token, member, plan);

  const profile = await MemberProfile.findOne({ user: member.user.id });
  assert.equal(String(profile.assignedTrainer), String(bob._id));
  assert.notEqual(String(profile.assignedTrainer), String(alice._id));
});

test('unavailable and inactive trainers are excluded from allocation', async () => {
  const { token } = await adminContext();
  // Blanket-unavailable any trainer created by earlier tests so the pool here
  // is truly empty regardless of run order.
  await TrainerProfile.updateMany({}, { isAvailable: false });
  const alice = await makeTrainer({ name: 'Alice', isAvailable: false });
  const bob = await makeTrainer({ name: 'Bob', isActive: false });
  const plan = await createPlan(token, { trainerIncluded: true, trainerAllocationMode: 'ASSIGNED' });

  const member = await registerMember();
  const membership = await activatePlan(token, member, plan);

  const profile = await MemberProfile.findOne({ user: member.user.id });
  assert.equal(profile.trainerAssignmentStatus, 'PENDING');
  assert.equal(profile.assignedTrainer, undefined);
  assert.match(profile.pendingTrainerReason, /no eligible trainer/i);

  // Membership still activated - a missing trainer never blocks the gym access.
  const active = await request('GET', `/api/memberships/active/${member.user.id}`, { token });
  assert.equal(active.body.membership.status, 'ACTIVE');

  // Admins were notified that allocation is required.
  const admin = await User.findOne({ role: 'admin', isActive: true });
  const notice = await Notification.findOne({ user: admin._id, type: 'trainer_assignment' });
  assert.ok(notice, 'admin is notified about the pending allocation');
  assert.match(notice.message, /plan/);
});

test('maxMembers caps how many members a trainer can be assigned', async () => {
  const { token } = await adminContext();
  const alice = await makeTrainer({ name: 'Alice', maxMembers: 1 });
  const bob = await makeTrainer({ name: 'Bob', maxMembers: 50 });
  const plan = await createPlan(token, { trainerIncluded: true, trainerAllocationMode: 'ASSIGNED' });

  const first = await registerMember();
  await activatePlan(token, first, plan);
  const profileA = await MemberProfile.findOne({ user: first.user.id });
  assert.equal(String(profileA.assignedTrainer), String(alice._id), 'alice has room');

  const second = await registerMember();
  await activatePlan(token, second, plan);
  const profileB = await MemberProfile.findOne({ user: second.user.id });
  assert.equal(String(profileB.assignedTrainer), String(bob._id), 'alice is at capacity, bob gets it');
});

test('a plan without trainer entitlement clears/never assigns a trainer', async () => {
  const { token } = await adminContext();
  await makeTrainer({ name: 'Idle' });
  const plan = await createPlan(token);

  const member = await registerMember();
  await activatePlan(token, member, plan);

  const profile = await MemberProfile.findOne({ user: member.user.id });
  assert.equal(profile.trainerAssignmentStatus, 'NONE');
  assert.equal(profile.assignedTrainer, undefined);
});

test('allocation is idempotent - repeated activation does not swap the trainer', async () => {
  const { token } = await adminContext();
  const alice = await makeTrainer({ name: 'Alice' });
  const bob = await makeTrainer({ name: 'Bob' });
  const plan = await createPlan(token, { trainerIncluded: true, trainerAllocationMode: 'ASSIGNED' });

  const member = await registerMember();
  const membership = await activatePlan(token, member, plan);

  const profile = await MemberProfile.findOne({ user: member.user.id });
  assert.equal(String(profile.assignedTrainer), String(alice._id));

  // Re-run allocation directly (e.g. admin reviewing a membership) - the
  // already-assigned member keeps the same trainer without force.
  const again = await allocateTrainerForMembership(membership._id);
  assert.equal(again.status, 'assigned');
  assert.equal(String(again.trainerId), String(alice._id));

  const profileAfter = await MemberProfile.findOne({ user: member.user.id });
  assert.equal(String(profileAfter.assignedTrainer), String(alice._id));
});

test('AllData cannot arbitrarily reassign a trainer (assignment status is business-governed)', async () => {
  const { token } = await adminContext();
  const alice = await makeTrainer({ name: 'Alice' });
  const bob = await makeTrainer({ name: 'Bob' });
  const plan = await createPlan(token, { trainerIncluded: true, trainerAllocationMode: 'ASSIGNED' });

  const member = await registerMember();
  await activatePlan(token, member, plan);

  const profile = await MemberProfile.findOne({ user: member.user.id });
  const assigned = profile.assignedTrainer;

  const tamper = await request('PUT', `/api/admin/all/memberProfiles/${profile._id}`, {
    token,
    body: { assignedTrainer: bob._id, trainerAssignmentStatus: 'NONE' },
  });
  assert.equal(tamper.status, 200);

  const after = await MemberProfile.findById(profile._id);
  assert.equal(String(after.assignedTrainer), String(assigned), 'assignedTrainer untouched by AllData');
  assert.equal(after.trainerAssignmentStatus, 'ASSIGNED', 'status untouched by AllData');
});