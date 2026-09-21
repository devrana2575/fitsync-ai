'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, request, registerMember, adminContext, uniqueEmail } = require('./helpers');

const User = require('../models/User');
const TrainerProfile = require('../models/TrainerProfile');
const MemberProfile = require('../models/MemberProfile');

let baseUrl;
before(async () => {
  ({ baseUrl } = await setup());
});
after(teardown);

let counter = 0;
const uniqueName = (base) => `${base} ${++counter} (${Date.now()})`;

const makeTrainer = async ({ name, isAvailable = true } = {}) => {
  const user = await User.create({ name, email: uniqueEmail('trainer'), password: 'Trainer@123', role: 'trainer' });
  await TrainerProfile.create({ user: user._id, phone: '9876543210', isAvailable });
  return user;
};

const assignMember = async (userId, trainerId, status = 'ASSIGNED') => {
  const profile = await MemberProfile.findOne({ user: userId });
  profile.assignedTrainer = trainerId;
  profile.trainerAssignmentStatus = status;
  await profile.save();
  return profile;
};

test('a trainer can create a plan only for a member assigned to them', async () => {
  const { token } = await adminContext();
  const alice = await makeTrainer({ name: 'Alice' });
  const bob = await makeTrainer({ name: 'Bob' });

  const aliceMember = await registerMember();
  await assignMember(aliceMember.user.id, alice._id);
  const bobMember = await registerMember();
  await assignMember(bobMember.user.id, bob._id);

  const aliceToken = (await request('POST', '/api/auth/login', { body: { email: alice.email, password: 'Trainer@123' } })).body.token;
  const bobToken = (await request('POST', '/api/auth/login', { body: { email: bob.email, password: 'Trainer@123' } })).body.token;

  // Alice can author a plan for her own member.
  const own = await request('POST', '/api/workouts', {
    token: aliceToken,
    body: {
      member: aliceMember.user.id,
      name: uniqueName('Plan'),
      description: 'Strength focus',
      goal: 'strength',
      hoursPerDay: 1,
      totalHours: 20,
      recommendationSource: 'trainer',
    },
  });
  assert.equal(own.status, 201, own.body && own.body.message);
  assert.equal(String(own.body.plan.trainer), String(alice._id));
  assert.equal(own.body.plan.title || own.body.plan.goal, 'strength');

  // Alice cannot author for Bob's member.
  const foreign = await request('POST', '/api/workouts', {
    token: aliceToken,
    body: { member: bobMember.user.id, name: uniqueName('Plan') },
  });
  assert.equal(foreign.status, 403);
  assert.match(foreign.body.message, /assigned to you/);

  // Admins are unrestricted.
  const adminMade = await request('POST', '/api/workouts', {
    token,
    body: { member: bobMember.user.id, name: uniqueName('Plan') },
  });
  assert.equal(adminMade.status, 201, adminMade.body && adminMade.body.message);
});

test('a trainer cannot modify or deactivate another trainers plan', async () => {
  const { token } = await adminContext();
  const alice = await makeTrainer({ name: 'Alice' });
  const bob = await makeTrainer({ name: 'Bob' });
  const member = await registerMember();
  await assignMember(member.user.id, alice._id);

  const aliceToken = (await request('POST', '/api/auth/login', { body: { email: alice.email, password: 'Trainer@123' } })).body.token;
  const bobToken = (await request('POST', '/api/auth/login', { body: { email: bob.email, password: 'Trainer@123' } })).body.token;

  const created = await request('POST', '/api/workouts', {
    token: aliceToken,
    body: { member: member.user.id, name: uniqueName('Plan') },
  });
  const planId = created.body.plan._id;

  const edit = await request('PUT', `/api/workouts/${planId}`, {
    token: bobToken,
    body: { isActive: false },
  });
  assert.equal(edit.status, 403);

  const del = await request('DELETE', `/api/workouts/${planId}`, {
    token: bobToken,
  });
  assert.equal(del.status, 403);

  // Alice still owns it.
  const mine = await request('PUT', `/api/workouts/${planId}`, {
    token: aliceToken,
    body: { hoursPerDay: 2 },
  });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.plan.hoursPerDay, 2);
});

test('a member cannot see another members workout plans', async () => {
  const { token } = await adminContext();
  const alice = await makeTrainer({ name: 'Alice' });
  const memberA = await registerMember();
  const memberB = await registerMember();
  await assignMember(memberA.user.id, alice._id);

  const aliceToken = (await request('POST', '/api/auth/login', { body: { email: alice.email, password: 'Trainer@123' } })).body.token;
  const created = await request('POST', '/api/workouts', {
    token: aliceToken,
    body: { member: memberA.user.id, name: uniqueName('Plan') },
  });
  const planId = created.body.plan._id;

  const foreign = await request('GET', `/api/workouts/${planId}`, { token: memberB.token });
  assert.equal(foreign.status, 403);

  const own = await request('GET', `/api/workouts/${planId}`, { token: memberA.token });
  assert.equal(own.status, 200);
});

test('a SHARED-entitlement member can be coached by any roster trainer', async () => {
  const { token } = await adminContext();
  const alice = await makeTrainer({ name: 'Alice' });
  const bob = await makeTrainer({ name: 'Bob' });

  const member = await registerMember();

  // Member on a SHARED plan - allocate any trainer as point of contact.
  const plan = await (async () => {
    const res = await request('POST', '/api/membership-plans', {
      token,
      body: { name: uniqueName('Shared'), price: 1000, duration: 30, trainerIncluded: true, trainerAllocationMode: 'SHARED' },
    });
    return res.body.plan;
  })();
  const pay = await request('POST', '/api/payments', {
    token,
    body: { userId: member.user.id, planId: plan._id, amount: 1000, method: 'cash', status: 'COMPLETED' },
  });
  assert.equal(pay.status, 201, pay.body && pay.body.message);

  const profile = await MemberProfile.findOne({ user: member.user.id });
  assert.equal(profile.trainerAssignmentStatus, 'ASSIGNED');

  const bobToken = (await request('POST', '/api/auth/login', { body: { email: bob.email, password: 'Trainer@123' } })).body.token;
  const planByBob = await request('POST', '/api/workouts', {
    token: bobToken,
    body: { member: member.user.id, name: uniqueName('Plan') },
  });
  assert.equal(planByBob.status, 201, 'any roster trainer may coach a SHARED member');
});