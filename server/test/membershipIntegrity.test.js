'use strict';
// Membership-integrity + trainer-capacity + payment-ledger hardening tests.
//
// P1#6: at most one ACTIVE membership per user.
//   - DB partial unique index rejects a second ACTIVE row for the same user.
//   - activation supersedes competitors; concurrent activations reconcile via
//     an E11000 catch-and-retry so exactly one ACTIVE ever survives.
// P1#7: trainer capacity under concurrent activation (allocateTrainerForMembership
//   runs inside an in-process mutex, so the eligibility pool is recomputed after
//   each committed assignment).
// P2: payment ledger is annotation-only through AllData, and plan-price edits
//   can never rewrite a membership's committed financials (planSnapshot).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, request, registerMember, adminContext, uniqueEmail } = require('./helpers');

const User = require('../models/User');
const Membership = require('../models/Membership');
const MembershipPlan = require('../models/MembershipPlan');
const MemberProfile = require('../models/MemberProfile');
const TrainerProfile = require('../models/TrainerProfile');
const Payment = require('../models/Payment');
const { activateMembershipFromPayment } = require('../utils/membershipActivation');

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

const makeTrainer = async ({ name, maxMembers = 20, specializations = [] } = {}) => {
  const user = await User.create({ name, email: uniqueEmail('trainer'), password: 'Trainer@123', role: 'trainer' });
  await TrainerProfile.create({ user: user._id, phone: '9876543210', maxMembers, specializations, isAvailable: true });
  return user;
};

const makePendingMembership = async (userId, plan, over = {}) =>
  Membership.create({
    user: userId,
    plan: plan._id,
    startDate: new Date(),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    status: 'PENDING',
    ...over,
  });

const makeUser = async (prefix) =>
  User.create({ name: uniqueName(prefix), email: uniqueEmail(prefix.toLowerCase()), password: 'Member@123', role: 'member' });

// ---------------------------------------------------------------------------
// P1#6 - one ACTIVE membership per member
// ---------------------------------------------------------------------------

test('P1#6: DB partial unique index rejects a second ACTIVE membership per user', async () => {
  const user = await makeUser('dup');
  const plan1 = await MembershipPlan.create({ name: uniqueName('Plan'), price: 1000, duration: 30 });
  const plan2 = await MembershipPlan.create({ name: uniqueName('Plan'), price: 2000, duration: 60 });

  await Membership.create({
    user: user._id,
    plan: plan1._id,
    startDate: new Date(),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    status: 'ACTIVE',
  });

  await assert.rejects(
    Membership.create({
      user: user._id,
      plan: plan2._id,
      startDate: new Date(),
      endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      status: 'ACTIVE',
    }),
    (error) => error && error.code === 11000,
    'the DB must reject a second ACTIVE membership for the same user (E11000)'
  );

  // Historical rows in any non-ACTIVE status stay legal (partial filter).
  await Membership.create({
    user: user._id,
    plan: plan1._id,
    startDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    status: 'EXPIRED',
  });
  await Membership.create({
    user: user._id,
    plan: plan1._id,
    startDate: new Date(),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    status: 'PENDING',
  });

  const activeCount = await Membership.countDocuments({ user: user._id, status: 'ACTIVE' });
  assert.equal(activeCount, 1, 'exactly one ACTIVE row survives for the user');
});

test('P1#6: activating a second membership cancels the existing ACTIVE one', async () => {
  const { token } = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(token);

  const first = await makePendingMembership(member.user.id, plan);
  await activateMembershipFromPayment(first._id);
  assert.equal((await Membership.findById(first._id)).status, 'ACTIVE');

  const second = await makePendingMembership(member.user.id, plan);
  await activateMembershipFromPayment(second._id);

  assert.equal((await Membership.findById(first._id)).status, 'CANCELLED');
  assert.equal((await Membership.findById(second._id)).status, 'ACTIVE');
  const activeCount = await Membership.countDocuments({ user: member.user.id, status: 'ACTIVE' });
  assert.equal(activeCount, 1, 'no more than one ACTIVE membership for the user');
});

test('P1#6: concurrent activations race safely - exactly one ACTIVE, no E11000 escapes', async () => {
  const { token } = await adminContext();
  const member = await registerMember();
  const planA = await createPlan(token);
  const planB = await createPlan(token);

  const membershipA = await makePendingMembership(member.user.id, planA);
  const membershipB = await makePendingMembership(member.user.id, planB);

  await Promise.all([
    activateMembershipFromPayment(membershipA._id),
    activateMembershipFromPayment(membershipB._id),
  ]);

  const docs = await Membership.find({ user: member.user.id });
  const active = docs.filter((d) => d.status === 'ACTIVE').length;
  const cancelled = docs.filter((d) => d.status === 'CANCELLED').length;
  assert.equal(active, 1, 'exactly one ACTIVE membership after the race');
  assert.equal(cancelled, 1, 'the loser is superseded to CANCELLED');
});

test('P1#6: complimentary grant supersedes an existing ACTIVE membership (route flow)', async () => {
  const { token } = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(token);

  const first = await request('POST', '/api/memberships', {
    token,
    body: { userId: member.user.id, planId: plan._id, complimentary: true },
  });
  assert.equal(first.status, 201, first.body && first.body.message);
  const firstId = first.body.membership._id;

  assert.equal((await Membership.findById(firstId)).status, 'ACTIVE');

  const second = await request('POST', '/api/memberships', {
    token,
    body: { userId: member.user.id, planId: plan._id, complimentary: true },
  });
  assert.equal(second.status, 201, second.body && second.body.message);
  const secondId = second.body.membership._id;

  assert.equal((await Membership.findById(firstId)).status, 'CANCELLED', 'old membership superseded');
  assert.equal((await Membership.findById(secondId)).status, 'ACTIVE', 'new complimentary grant is ACTIVE');
  const activeCount = await Membership.countDocuments({ user: member.user.id, status: 'ACTIVE' });
  assert.equal(activeCount, 1, 'exactly one ACTIVE after the complimentary flow');
});

// ---------------------------------------------------------------------------
// P1#7 - trainer capacity concurrency
// ---------------------------------------------------------------------------

test('P1#7: trainer maxMembers is respected under concurrent activation', async () => {
  const { token } = await adminContext();
  const trainer = await makeTrainer({ name: 'Kate', maxMembers: 1 });
  const plan = await createPlan(token, { trainerIncluded: true, trainerAllocationMode: 'ASSIGNED' });

  const member1 = await registerMember();
  const member2 = await registerMember();
  const m1 = await makePendingMembership(member1.user.id, plan);
  const m2 = await makePendingMembership(member2.user.id, plan);

  await Promise.all([
    activateMembershipFromPayment(m1._id),
    activateMembershipFromPayment(m2._id),
  ]);

  // Activation itself never blocks: both memberships must be ACTIVE.
  assert.equal((await Membership.findById(m1._id)).status, 'ACTIVE');
  assert.equal((await Membership.findById(m2._id)).status, 'ACTIVE');

  // Capacity: exactly one member is ASSIGNED to the trainer.
  const assigned = await MemberProfile.countDocuments({ assignedTrainer: trainer._id });
  assert.equal(assigned, 1, 'trainer with maxMembers:1 gets exactly one assignment');
  assert.ok(assigned <= 1);

  // The other member is PENDING with a reason.
  const pendingProfiles = await MemberProfile.find({
    user: { $in: [member1.user.id, member2.user.id] },
    trainerAssignmentStatus: 'PENDING',
  });
  assert.equal(pendingProfiles.length, 1, 'exactly one member waits for a trainer');
  assert.ok(pendingProfiles[0].pendingTrainerReason, 'pending member carries a reason');
});

// ---------------------------------------------------------------------------
// P2 - payment ledger + plan-price immutability
// ---------------------------------------------------------------------------

test('P2: AllData cannot rewrite the payment ledger (annotation only)', async () => {
  const { token } = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(token);

  const pay = await request('POST', '/api/payments', {
    token,
    body: { userId: member.user.id, planId: plan._id, amount: 1000, method: 'cash', status: 'COMPLETED' },
  });
  assert.equal(pay.status, 201, pay.body && pay.body.message);
  const paymentId = pay.body.payment._id;

  const before = await Payment.findById(paymentId);

  const tamper = await request('PUT', `/api/admin/all/payments/${paymentId}`, {
    token,
    body: { amount: 999999, status: 'REFUNDED', transactionId: 'hacked', date: '2001-01-01T00:00:00.000Z', notes: 'test annotation' },
  });
  assert.equal(tamper.status, 200);

  const after = await Payment.findById(paymentId);
  assert.equal(after.amount, before.amount, 'amount is ledger-governed');
  assert.equal(after.status, before.status, 'status is ledger-governed');
  assert.equal(after.transactionId, before.transactionId, 'transactionId is ledger-governed');
  assert.equal(after.method, before.method, 'method is ledger-governed');
  assert.equal(after.date.getTime(), before.date.getTime(), 'date is ledger-governed');
  assert.equal(after.notes, 'test annotation', 'notes-style annotation edits still apply');
});

test('P2: plan price edits do not rewrite committed membership financials (planSnapshot)', async () => {
  const { token } = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(token); // price = 1000

  const pay = await request('POST', '/api/payments', {
    token,
    body: { userId: member.user.id, planId: plan._id, amount: 1000, method: 'cash', status: 'COMPLETED' },
  });
  assert.equal(pay.status, 201, pay.body && pay.body.message);

  const membership = await Membership.findOne({ user: member.user.id }).sort({ createdAt: -1 });
  assert.equal(membership.status, 'ACTIVE');
  assert.ok(membership.planSnapshot, 'membership records a commercial-terms snapshot');
  assert.equal(membership.planSnapshot.price, 1000);

  const bump = await request('PUT', `/api/membership-plans/${plan._id}`, { token, body: { price: 2500 } });
  assert.equal(bump.status, 200, bump.body && bump.body.message);

  const my = await request('GET', '/api/memberships/my', { token: member.token });
  assert.equal(my.status, 200, my.body && my.body.message);
  const view = my.body.memberships[0];
  assert.equal(view.status, 'ACTIVE');
  assert.equal(view.paidTotal, 1000, 'paidTotal derives from snapshot price');
  assert.equal(view.remaining, 0, 'remaining derives from the 1000 snapshot, not 2500');
  assert.equal(view.plan.price, 1000, 'merged plan view exposes the snapshotted price');
  assert.equal(view.plan.name, plan.name);
  assert.equal(view.trainerEntitlement.trainerAllocationMode, 'NONE', 'trainer entitlement stays from the live plan');
});