'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, request, registerMember, adminContext, createTrainer, uniqueEmail } = require('./helpers');

const User = require('../models/User');
const TrainerProfile = require('../models/TrainerProfile');
const MemberProfile = require('../models/MemberProfile');

// The working tree's Membership model declares two `{user:1}` indexes (the
// committed non-unique one and an uncommitted ACTIVE partial-unique one) that
// auto-generate the same name and make init() collide. This suite does not
// depend on DB-level index enforcement, so disable auto-indexing for it.
require('mongoose').set('autoIndex', false);

let baseUrl;
before(async () => {
  ({ baseUrl } = await setup());
});
after(teardown);

let counter = 0;
const uniqueName = (base) => `${base} ${++counter} (${Date.now()})`;

const makeTrainer = async ({ name }) => {
  const user = await User.create({ name, email: uniqueEmail('trainer'), password: 'Trainer@123', role: 'trainer' });
  await TrainerProfile.create({ user: user._id, phone: '9876543210', isAvailable: true });
  return user;
};

const createPlan = async (token, over = {}) => {
  const res = await request('POST', '/api/membership-plans', {
    token,
    body: { name: uniqueName('Plan'), price: 1000, duration: 30, ...over },
  });
  assert.equal(res.status, 201, res.body && res.body.message);
  return res.body.plan;
};

// Normal activation flow: completed payment mints an ACTIVE membership and
// auto-allocates a trainer per the plan entitlement (trainerAllocation).
const activate = async (token, member, plan) => {
  const res = await request('POST', '/api/payments', {
    token,
    body: { userId: member.user.id, planId: plan._id, amount: plan.price, method: 'cash', status: 'COMPLETED' },
  });
  assert.equal(res.status, 201, res.body && res.body.message);
};

const checkIn = async (adminToken, userId) => {
  const res = await request('POST', '/api/attendance/checkin', {
    token: adminToken,
    body: { userId, method: 'manual' },
  });
  assert.equal(res.status, 201, res.body && res.body.message);
};

const trainerToken = async (trainer) =>
  (await request('POST', '/api/auth/login', { body: { email: trainer.email, password: 'Trainer@123' } })).body.token;

test('GET /api/attendance/today scopes a trainer to their assigned members; admin sees all', async () => {
  const { token } = await adminContext();
  const alice = await makeTrainer({ name: 'Alice' });
  const bob = await makeTrainer({ name: 'Bob' });
  const plan = await createPlan(token, { trainerIncluded: true, trainerAllocationMode: 'ASSIGNED' });

  const memberA = await registerMember();
  await activate(token, memberA, plan);
  const profileA = await MemberProfile.findOne({ user: memberA.user.id });
  assert.equal(profileA.trainerAssignmentStatus, 'ASSIGNED');
  assert.equal(String(profileA.assignedTrainer), String(alice._id), 'first member auto-allocates to Alice');

  const memberB = await registerMember();
  await activate(token, memberB, plan);
  const profileB = await MemberProfile.findOne({ user: memberB.user.id });
  assert.equal(profileB.trainerAssignmentStatus, 'ASSIGNED');
  assert.equal(String(profileB.assignedTrainer), String(bob._id), 'second member auto-allocates to Bob');

  const aliceToken = await trainerToken(alice);
  const bobToken = await trainerToken(bob);

  // Only member A has checked in so far.
  await checkIn(token, memberA.user.id);

  const aliceToday = await request('GET', '/api/attendance/today', { token: aliceToken });
  assert.equal(aliceToday.status, 200);
  assert.equal(aliceToday.body.count, 1, 'trainer A sees exactly their own member');
  assert.equal(aliceToday.body.records.length, 1);
  assert.equal(String(aliceToday.body.records[0].user._id), String(memberA.user.id));

  const bobToday = await request('GET', '/api/attendance/today', { token: bobToken });
  assert.equal(bobToday.body.count, 0, 'trainer B sees nothing until their member checks in');
  assert.deepEqual(bobToday.body.records, []);

  // Member B checks in - trainer B finally sees it, trainer A stays scoped.
  await checkIn(token, memberB.user.id);

  const bobAfter = await request('GET', '/api/attendance/today', { token: bobToken });
  assert.equal(bobAfter.body.count, 1, 'trainer B sees exactly their own member');
  assert.equal(String(bobAfter.body.records[0].user._id), String(memberB.user.id));

  const aliceAfter = await request('GET', '/api/attendance/today', { token: aliceToken });
  assert.equal(aliceAfter.body.count, 1, 'trainer A never sees member B');
  assert.equal(String(aliceAfter.body.records[0].user._id), String(memberA.user.id));

  const adminToday = await request('GET', '/api/attendance/today', { token });
  assert.equal(adminToday.status, 200);
  assert.equal(adminToday.body.count, 2, 'admin still sees the full roll');
});

test('a trainer with no assigned members and no SHARED coverage sees an empty roll', async () => {
  const { token } = await adminContext();
  // No TrainerProfile -> never eligible for auto-allocation, and no member is
  // assigned to them. None of the plans in the suite are SHARED coverage.
  const carol = await createTrainer();

  const plan = await createPlan(token, { trainerIncluded: true, trainerAllocationMode: 'ASSIGNED' });
  const member = await registerMember();
  await activate(token, member, plan);
  await checkIn(token, member.user.id);

  const carolToken = await trainerToken(carol);
  const carolToday = await request('GET', '/api/attendance/today', { token: carolToken });
  assert.equal(carolToday.status, 200);
  assert.equal(carolToday.body.count, 0, 'attendance exists but trainer is out of scope');
  assert.deepEqual(carolToday.body.records, []);
});