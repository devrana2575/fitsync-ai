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

test('member profile stores multiple phone numbers, health and goal data', async () => {
  const { token } = await adminContext();
  const res = await request('POST', '/api/members', {
    token,
    body: {
      name: 'Gym Member',
      email: uniqueEmail('member'),
      password: 'Member@123',
      phoneNumbers: [
        { number: '9876543210', label: 'Primary' },
        { number: '9123456780', label: 'Emergency' },
      ],
      heightCm: 175,
      weightKg: 80,
      goals: ['weight_loss', 'strength'],
      medicalConditions: 'Asthma',
      allergies: ['penicillin'],
      medicalRestrictions: 'No heavy cardio',
      doctorRecommendation: 'Consult physio before leg day',
    },
  });
  assert.equal(res.status, 201, res.body && res.body.message);

  const list = await request('GET', '/api/members', { token });
  const created = list.body.members.find((m) => m.email === res.body.member.email || list.body.members.length === 1);
  assert.ok(created.profile);
  assert.equal(created.profile.phoneNumbers.length, 2);
  assert.equal(created.profile.phone, '9876543210', 'primary phone syncs to the legacy field');
  assert.equal(created.profile.heightCm, 175);
});

test('duplicate and invalid phone numbers are rejected', async () => {
  const { token } = await adminContext();
  const dup = await request('POST', '/api/members', {
    token,
    body: {
      name: 'Dup Member',
      email: uniqueEmail('member'),
      password: 'Member@123',
      phoneNumbers: [
        { number: '9876543210', label: 'Primary' },
        { number: '9876543210', label: 'Work' },
      ],
    },
  });
  assert.equal(dup.status, 400);
  assert.match(dup.body.message, /duplicate phone/i);

  const bad = await request('POST', '/api/members', {
    token,
    body: {
      name: 'Bad Member',
      email: uniqueEmail('member'),
      password: 'Member@123',
      phoneNumbers: [{ number: 'abc', label: 'Primary' }],
    },
  });
  assert.equal(bad.status, 400);
  assert.match(bad.body.message, /valid phone/i);
});

test('member self-update accepts the extended profile fields', async () => {
  const { token } = await adminContext();
  const member = await registerMember();

  const upd = await request('PUT', '/api/auth/me', {
    token: member.token,
    body: {
      name: 'Updated Name',
      phoneNumbers: [
        { number: '9111122233', label: 'Primary' },
        { number: '9222233344', label: 'Secondary' },
      ],
      heightCm: 170,
      weightKg: 72,
      goals: ['muscle_gain'],
      medicalNotes: 'Knee strain history',
    },
  });
  assert.equal(upd.status, 200, upd.body && upd.body.message);

  const me = await request('GET', '/api/auth/me', { token: member.token });
  assert.equal(me.body.user.name, 'Updated Name');
  assert.equal(me.body.profile.phoneNumbers.length, 2);
  assert.equal(me.body.profile.phone, '9111122233');
  assert.equal(me.body.profile.heightCm, 170);
  assert.deepEqual(me.body.profile.goals, ['muscle_gain']);
});

test('a member cannot change their own trainer assignment through the profile endpoint', async () => {
  const { token } = await adminContext();
  const member = await registerMember();

  const upd = await request('PUT', '/api/auth/me', {
    token: member.token,
    body: { trainerAssignmentStatus: 'ASSIGNED', pendingTrainerReason: 'self-selected' },
  });
  assert.equal(upd.status, 200, upd.body && upd.body.message);

  const me = await request('GET', '/api/auth/me', { token: member.token });
  assert.equal(me.body.profile.trainerAssignmentStatus, 'NONE');
  assert.equal(me.body.profile.assignedTrainer, undefined);
});

test('member detail enforces trainer isolation for assigned members', async () => {
  const { token } = await adminContext();
  const member = await registerMember();

  // Trainer (no assignment) cannot view the member.
  const trainerUser = await User.create({ name: 'Roster Trainer', email: uniqueEmail('trainer'), password: 'Trainer@123', role: 'trainer' });
  await TrainerProfile.create({ user: trainerUser._id, phone: '9876543210' });

  const trainerToken = await (async () => {
    const login = await request('POST', '/api/auth/login', { body: { email: trainerUser.email, password: 'Trainer@123' } });
    return login.body.token;
  })();

  const denied = await request('GET', `/api/members/${member.user.id}`, { token: trainerToken });
  assert.equal(denied.status, 403);

  // Once assigned, the same trainer can view the member.
  const assign = await request('POST', `/api/members/${member.user.id}/assign-trainer`, {
    token,
    body: { trainerId: trainerUser._id },
  });
  assert.equal(assign.status, 200, assign.body && assign.body.message);
  assert.equal(assign.body.profile.trainerAssignmentStatus, 'ASSIGNED');

  const allowed = await request('GET', `/api/members/${member.user.id}`, { token: trainerToken });
  assert.equal(allowed.status, 200);
});

test('assigning a trainer validates the target is an active trainer and respects capacity', async () => {
  const { token } = await adminContext();
  const member = await registerMember();
  const plan = await (async () => {
    const res = await request('POST', '/api/membership-plans', {
      token,
      body: { name: uniqueName('Plan'), price: 1000, duration: 30 },
    });
    return res.body.plan;
  })();

  // A non-trainer target must be rejected.
  const badTarget = await request('POST', `/api/members/${member.user.id}/assign-trainer`, {
    token,
    body: { trainerId: member.user.id },
  });
  assert.equal(badTarget.status, 400);
  assert.match(badTarget.body.message, /active trainer/);

  // Trainer at capacity cannot accept more.
  const packed = await User.create({ name: 'Full Trainer', email: uniqueEmail('trainer'), password: 'Trainer@123', role: 'trainer' });
  await TrainerProfile.create({ user: packed._id, phone: '9876543210', maxMembers: 1 });

  const other = await registerMember();
  const profile1 = await MemberProfile.findOne({ user: other.user.id });
  profile1.assignedTrainer = packed._id;
  profile1.trainerAssignmentStatus = 'ASSIGNED';
  await profile1.save();

  const over = await request('POST', `/api/members/${member.user.id}/assign-trainer`, {
    token,
    body: { trainerId: packed._id },
  });
  assert.equal(over.status, 400);
  assert.match(over.body.message, /member limit/);
});