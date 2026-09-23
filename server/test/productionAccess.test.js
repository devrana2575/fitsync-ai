'use strict';
// Business-rule tests for the production hardening pass:
//  - trainer data-access scoping & medical-field isolation on rosters
//  - SUSPENDED membership lifecycle & check-in gating
//  - audit trail rows on membership/payment transitions
//  - financial records are never hard-deleted via AllData
//  - enriched membership view exposes derived facts server-computed
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, request, registerMember, adminContext, login, uniqueEmail } = require('./helpers');

const User = require('../models/User');
const TrainerProfile = require('../models/TrainerProfile');
const MemberProfile = require('../models/MemberProfile');
const Membership = require('../models/Membership');
const Payment = require('../models/Payment');
const AuditLog = require('../models/AuditLog');

let baseUrl;
before(async () => {
  ({ baseUrl } = await setup());
});
after(teardown);

let counter = 0;
const uniqueName = (base) => `${base} ${++counter} (${Date.now()})`;
const trainerToken = async (trainer) => login(trainer.email, 'Trainer@123');

const makeTrainer = async (name) => {
  const user = await User.create({ name, email: uniqueEmail('trainer'), password: 'Trainer@123', role: 'trainer' });
  await TrainerProfile.create({ user: user._id, phone: '9876543210', isAvailable: true });
  return user;
};

const memberToken = (member) => member.token;

const buyPlan = async ({ token, userId, trainerIncluded = false, trainerAllocationMode = 'NONE' }) => {
  const planRes = await request('POST', '/api/membership-plans', {
    token,
    body: {
      name: uniqueName('Plan'),
      price: 1000,
      duration: 30,
      trainerIncluded,
      trainerAllocationMode,
    },
  });
  const plan = planRes.body.plan;
  const pay = await request('POST', '/api/payments', {
    token,
    body: { userId, planId: plan._id, amount: 1000, method: 'cash', status: 'COMPLETED' },
  });
  assert.equal(pay.status, 201, pay.body && pay.body.message);
  return { plan, membership: pay.body.payment && pay.body.payment.membership };
};

test('trainer roster list shows only entitled members and never medical fields', async () => {
  const { token } = await adminContext();
  const alice = await makeTrainer('Alice');
  const bob = await makeTrainer('Bob');

  const aliceMember = await registerMember();
  const bobMember = await registerMember();
  const outsider = await registerMember();

  const aliceProfile = await MemberProfile.findOne({ user: aliceMember.user.id });
  aliceProfile.assignedTrainer = alice._id;
  aliceProfile.trainerAssignmentStatus = 'ASSIGNED';
  aliceProfile.medicalConditions = 'asthma';
  aliceProfile.injuries = 'old knee injury';
  await aliceProfile.save();

  const aliceTok = await trainerToken(alice);
  const bobTok = await trainerToken(bob);

  const aliceList = await request('GET', '/api/members', { token: aliceTok });
  assert.equal(aliceList.status, 200);
  const aliceMembers = aliceList.body.members;
  assert.ok(aliceMembers.some((m) => String(m._id) === String(aliceMember.user.id)), 'assigned member visible');
  assert.ok(!aliceMembers.some((m) => String(m._id) === String(outsider.user.id) || String(m._id) === String(bobMember.user.id)), 'unentitled members never appear');

  // Medical fields are stripped from every roster row served to a trainer.
  for (const m of aliceMembers) {
    assert.equal(m.profile && m.profile.medicalConditions, undefined, 'medicalConditions stripped on roster');
    assert.equal(m.profile && m.profile.injuries, undefined, 'injuries stripped on roster');
  }

  // Admins see the full roster including medical context.
  const adminList = await request('GET', '/api/members', { token });
  assert.ok(adminList.body.members.some((m) => String(m._id) === String(aliceMember.user.id) && m.profile && m.profile.medicalConditions === 'asthma'), 'admin list keeps medical context');

  // Bob sees nobody from Alice's roster.
  const bobList = await request('GET', '/api/members', { token: bobTok });
  assert.ok(!bobList.body.members.some((m) => String(m._id) === String(aliceMember.user.id) || String(m._id) === String(bobMember.user.id)));
});

test('trainers cannot probe another members active membership, photos or logs', async () => {
  const { token } = await adminContext();
  const alice = await makeTrainer('Alice');
  const bob = await makeTrainer('Bob');

  const aliceMember = await registerMember();
  const bobMember = await registerMember();

  const aliceProfile = await MemberProfile.findOne({ user: aliceMember.user.id });
  aliceProfile.assignedTrainer = alice._id;
  aliceProfile.trainerAssignmentStatus = 'ASSIGNED';
  await aliceProfile.save();

  const bobProfile = await MemberProfile.findOne({ user: bobMember.user.id });
  bobProfile.assignedTrainer = bob._id;
  bobProfile.trainerAssignmentStatus = 'ASSIGNED';
  await bobProfile.save();

  // Alice's member is simply assigned (no plan, so the assignment survives).
  // Bob's member holds an ACTIVE plan with ASSIGNED trainer coverage so the
  // allocation service keeps Bob as the point of contact.
  await buyPlan({ token, userId: bobMember.user.id, trainerIncluded: true, trainerAllocationMode: 'ASSIGNED' });

  const aliceTok = await trainerToken(alice);
  const bobTok = await trainerToken(bob);

  // Bob may not read aliceMember's ACTIVE membership.
  const probe = await request('GET', `/api/memberships/active/${aliceMember.user.id}`, { token: bobTok });
  assert.equal(probe.status, 403);

  const own = await request('GET', `/api/memberships/active/${bobMember.user.id}`, { token: bobTok });
  assert.equal(own.status, 200);
  assert.equal(String(own.body.membership.user), String(bobMember.user.id));

  // Bob may not read a photo/log listing for aliceMember.
  const photos = await request('GET', `/api/photos/member/${aliceMember.user.id}`, { token: bobTok });
  assert.equal(photos.status, 403);
  const logs = await request('GET', `/api/workout-logs/member/${aliceMember.user.id}`, { token: bobTok });
  assert.equal(logs.status, 403);

  // Alice *can* read her own member's photo listing (even empty).
  const alicePhotos = await request('GET', `/api/photos/member/${aliceMember.user.id}`, { token: aliceTok });
  assert.equal(alicePhotos.status, 200);
});

test('trainers can only assign templates to members assigned to them', async () => {
  const { token } = await adminContext();
  const alice = await makeTrainer('Alice');
  const bob = await makeTrainer('Bob');

  const aliceMember = await registerMember();
  const bobMember = await registerMember();

  const aliceProfile = await MemberProfile.findOne({ user: aliceMember.user.id });
  aliceProfile.assignedTrainer = alice._id;
  aliceProfile.trainerAssignmentStatus = 'ASSIGNED';
  await aliceProfile.save();
  const bobProfile = await MemberProfile.findOne({ user: bobMember.user.id });
  bobProfile.assignedTrainer = bob._id;
  bobProfile.trainerAssignmentStatus = 'ASSIGNED';
  await bobProfile.save();

  const aliceTok = await trainerToken(alice);
  const bobTok = await trainerToken(bob);

  // Alice authors a private template, assigns it to her own member.
  const created = await request('POST', '/api/templates', {
    token: aliceTok,
    body: { name: uniqueName('Template'), goal: 'strength', difficulty: 'intermediate' },
  });
  assert.equal(created.status, 201, created.body && created.body.message);

  const own = await request('POST', `/api/templates/${created.body.template._id}/assign`, {
    token: aliceTok,
    body: { memberId: aliceMember.user.id },
  });
  assert.equal(own.status, 201, own.body && own.body.message);

  // Alice cannot assign a template to Bob's member (business entitlement).
  const foreign = await request('POST', `/api/templates/${created.body.template._id}/assign`, {
    token: aliceTok,
    body: { memberId: bobMember.user.id },
  });
  assert.equal(foreign.status, 403);

  // Bob cannot even read (or use) another trainer's private template.
  const read = await request('GET', `/api/templates/${created.body.template._id}`, { token: bobTok });
  assert.equal(read.status, 403);
});

test('SUSPENDED lifetime: access gated on check-in, reactivation restores or expires', async () => {
  const { token } = await adminContext();
  const alice = await makeTrainer('Alice');
  const member = await registerMember();
  await buyPlan({ token, userId: member.user.id });

  const membership = await Membership.findOne({ user: member.user.id, status: 'ACTIVE' });
  assert.ok(membership, 'member has an active membership');
  const membershipId = membership._id.toString();
  const aliceTok = await trainerToken(alice);

  // Baseline: check-in works with an ACTIVE membership.
  const ok = await request('POST', '/api/attendance/checkin', { token, body: { userId: member.user.id } });
  assert.equal(ok.status, 201, ok.body && ok.body.message);

  // Suspend - only ACTIVE can be suspended.
  const badSuspend = await request('PUT', `/api/memberships/${membershipId}/suspend`, { token, body: { reason: '' } });
  assert.equal(badSuspend.status, 200, badSuspend.body && badSuspend.body.message);
  assert.equal(badSuspend.body.membership.status, 'SUSPENDED');

  // The same-day duplicate would fail with 400 anyway - validate the gate on a
  // second member that did NOT check in today.
  const member2 = await registerMember();
  await buyPlan({ token, userId: member2.user.id });
  const m2 = await Membership.findOne({ user: member2.user.id, status: 'ACTIVE' });
  await request('PUT', `/api/memberships/${m2._id}/suspend`, { token, body: { reason: 'policy breach' } });

  const gate = await request('POST', '/api/attendance/checkin', { token, body: { userId: member2.user.id } });
  assert.equal(gate.status, 403, 'suspended membership cannot gain gym access');
  assert.match(gate.body.message, /Active membership required/);

  // Admins can reactivate - access returns.
  const reactivate = await request('PUT', `/api/memberships/${m2._id}/reactivate`, { token });
  assert.equal(reactivate.status, 200);
  assert.equal(reactivate.body.membership.status, 'ACTIVE');
  const backIn = await request('POST', '/api/attendance/checkin', { token, body: { userId: member2.user.id } });
  assert.equal(backIn.status, 201, backIn.body && backIn.body.message);

  // A suspended membership whose window already passed expires on reactivation.
  const member3 = await registerMember();
  await buyPlan({ token, userId: member3.user.id });
  const m3 = await Membership.findOne({ user: member3.user.id, status: 'ACTIVE' });
  m3.endDate = new Date(Date.now() - 1000);
  await m3.save();
  await request('PUT', `/api/memberships/${m3._id}/suspend`, { token });
  const expiredBack = await request('PUT', `/api/memberships/${m3._id}/reactivate`, { token });
  assert.equal(expiredBack.body.membership.status, 'EXPIRED');

  // Stats expose the suspended bucket.
  const stats = await request('GET', '/api/memberships/stats', { token });
  assert.ok(stats.body.suspended >= 1, 'stats include suspended count');

  // A suspended membership cannot be suspended again.
  const double = await request('PUT', `/api/memberships/${membershipId}/suspend`, { token });
  assert.equal(double.status, 400);

  void aliceTok;
});

test('audit trail records membership and payment transitions', async () => {
  const { token, user: admin } = await adminContext();
  const member = await registerMember();
  await buyPlan({ token, userId: member.user.id });

  const membership = await Membership.findOne({ user: member.user.id, status: 'ACTIVE' });

  const suspendedLogs = await AuditLog.countDocuments({ entity: 'Membership', entityId: membership._id, action: 'suspended' });
  assert.equal(suspendedLogs, 0);

  await request('PUT', `/api/memberships/${membership._id}/suspend`, { token, body: { reason: 'audit test' } });

  const activation = await AuditLog.findOne({ entity: 'Membership', entityId: membership._id, action: 'activated' });
  assert.ok(activation, 'activation is audited');
  assert.equal(String(activation.user), String(member.user.id));

  const suspended = await AuditLog.findOne({ entity: 'Membership', entityId: membership._id, action: 'suspended' });
  assert.ok(suspended);
  assert.equal(String(suspended.actor), String(admin._id));
  assert.match(suspended.reason, /audit test/);

  await request('PUT', `/api/memberships/${membership._id}/reactivate`, { token });
  const reactivated = await AuditLog.findOne({ entity: 'Membership', entityId: membership._id, action: 'reactivated' });
  assert.ok(reactivated, 'reactivation is audited');
});

test('AllData can never hard-delete a payment (financial ledge-record)', async () => {
  const { token } = await adminContext();
  const member = await registerMember();
  const { membership } = await buyPlan({ token, userId: member.user.id });

  const payment = await Payment.findOne({ membership }).sort({ date: -1 });
  assert.ok(payment);

  const del = await request('DELETE', `/api/admin/all/payments/${payment._id}`, { token });
  assert.equal(del.status, 400);
  assert.match(del.body.message, /cannot be deleted|financial/i);

  const stillThere = await Payment.findById(payment._id);
  assert.ok(stillThere, 'payment still on the books');
});

test('enriched membership view exposes server-computed facts', async () => {
  const { token } = await adminContext();
  const member = await registerMember();
  const { plan } = await buyPlan({ token, userId: member.user.id });

  const mine = await request('GET', '/api/memberships/my', { token: memberToken(member) });
  assert.equal(mine.status, 200);
  const view = mine.body.memberships[0];
  assert.ok(view.membershipId, 'membershipId present');
  assert.match(view.membershipId, /^FS-/);
  assert.equal(view.status, 'ACTIVE');
  assert.ok(Number.isInteger(view.daysRemaining));
  assert.ok(Number.isInteger(view.progressPercent));
  assert.equal(view.paymentStatus, 'PAID');
  assert.equal(Number(view.paidTotal), plan.price);
  assert.ok(Array.isArray(view.payments));

  // Admin detail gets the same derived facts without changing its shape.
  const detail = await request('GET', `/api/memberships/${view._id}`, { token });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.paidTotal, plan.price);
  assert.ok(Number.isInteger(detail.body.membership.daysRemaining));
  assert.ok(detail.body.membership.membershipId);
});