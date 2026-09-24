'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, request, registerMember, adminContext } = require('./helpers');

const MembershipPlan = require('../models/MembershipPlan');
const { getInstallmentSchedule, getNextDueInstallment } = require('../utils/paymentTerms');

// Heal a pre-existing index-name collision OUTSIDE this task's files:
// Membership.js declares BOTH `index({ user: 1 })` and
// `index({ user: 1 }, { unique, partialFilterExpression })`, which auto-generate
// the same index name "user_1", so Model.init() can spuriously fail on a cold
// test DB. Renaming the duplicate to a distinct explicit name keeps the unique
// ACTIVE constraint building without altering any query behaviour; this is a
// no-op once the declaration stops colliding.
const Membership = require('../models/Membership');
const healMembershipIndexNames = () => {
  try {
    const seen = new Map();
    for (const [fields, options] of Membership.schema._indexes || []) {
      if (!fields || !options) continue;
      const auto = Object.keys(fields).map((k) => `${k}_${fields[k]}`).join('_');
      const base = options.name || auto;
      const count = (seen.get(base) || 0) + 1;
      seen.set(base, count);
      if (count > 1) options.name = `${base}_alt${count - 1}`;
    }
  } catch {
    // best-effort; the shared index build may still race without this shim
  }
};
healMembershipIndexNames();

// Exactness of the installment schedule:
// - price / installments is computed in INTEGER paise
// - the remainder lands in the FINAL installment
// - so sum(installmentSchedule amounts) === plan.price EXACTLY
// Plus the manual-payment flow that must follow the schedule in order, and the
// explicit offline-counter installment policy surfaced on plan read payloads.

let baseUrl;
before(async () => {
  ({ baseUrl } = await setup());
});
after(teardown);

let counter = 0;
const uniqueName = (base) => `${base} ${++counter} (${Date.now()})`;

const createPlanModel = async (over = {}) =>
  MembershipPlan.create({
    name: uniqueName('Model Plan'),
    price: 1000,
    duration: 30,
    paymentMode: 'INSTALLMENT',
    installments: 3,
    ...over,
  });

const createPlanApi = async (token, over = {}) => {
  const res = await request('POST', '/api/membership-plans', {
    token,
    body: { name: uniqueName('Plan'), price: 1000, duration: 30, ...over },
  });
  assert.equal(res.status, 201, res.body && res.body.message);
  return res.body.plan;
};

const payPlan = async (token, userId, planId, amount) =>
  request('POST', '/api/payments', {
    token,
    body: { userId, planId, amount, method: 'cash', status: 'COMPLETED' },
  });

const amounts = (plan) => (plan.installmentSchedule || []).map((e) => e.amount);
const seqs = (plan) => (plan.installmentSchedule || []).map((e) => e.seq);

test('₹1000 / 3 → schedule [333.33, 333.33, 333.34] summing exactly to 1000', async () => {
  const plan = await createPlanModel({ price: 1000, installments: 3 });

  assert.equal(plan.installmentAmount, 333.33);
  assert.equal(plan.finalInstallmentAmount, 333.34);
  assert.equal(plan.installmentSchedule.length, 3);
  assert.deepEqual(seqs(plan), [1, 2, 3]);
  assert.deepEqual(amounts(plan), [333.33, 333.33, 333.34]);

  const sum = amounts(plan).reduce((s, a) => s + a, 0);
  assert.ok(Math.abs(sum - 1000) < 1e-9, `sum ${sum} !== 1000`);
  for (const a of amounts(plan)) {
    assert.ok(Math.abs(a * 100 - Math.round(a * 100)) < 1e-6, `${a} is not 2dp`);
  }
});

test('₹1000 / 4 → uniform 250 schedule (backward compat)', async () => {
  const plan = await createPlanModel({ price: 1000, installments: 4 });

  assert.deepEqual(amounts(plan), [250, 250, 250, 250]);
  assert.equal(plan.installmentAmount, 250);
  assert.equal(plan.finalInstallmentAmount, 250);
  const sum = amounts(plan).reduce((s, a) => s + a, 0);
  assert.equal(sum, 1000);
});

test('₹999 / 3 → uniform 333 (divisible paise) summing exactly to 999', async () => {
  const plan = await createPlanModel({ price: 999, installments: 3 });

  assert.deepEqual(amounts(plan), [333, 333, 333]);
  assert.equal(plan.finalInstallmentAmount, 333);
  const sum = amounts(plan).reduce((s, a) => s + a, 0);
  assert.equal(sum, 999);
});

test('₹1499.5 / 3 → [499.83, 499.83, 499.84] summing exactly to 1499.5', async () => {
  const plan = await createPlanModel({ price: 1499.5, installments: 3 });

  assert.equal(plan.installmentAmount, 499.83);
  assert.equal(plan.finalInstallmentAmount, 499.84);
  assert.deepEqual(amounts(plan), [499.83, 499.83, 499.84]);
  const sum = amounts(plan).reduce((s, a) => s + a, 0);
  assert.ok(Math.abs(sum - 1499.5) < 1e-9, `sum ${sum} !== 1499.5`);
  for (const a of amounts(plan)) {
    assert.ok(Math.abs(a * 100 - Math.round(a * 100)) < 1e-6, `${a} is not 2dp`);
  }
});

test('manual payments must follow the exact schedule; the remainder-final installment activates the membership', async () => {
  const { token } = await adminContext();
  const member = await registerMember();
  const plan = await createPlanApi(token, { paymentMode: 'INSTALLMENT', installments: 3 });

  const first = await payPlan(token, member.user.id, plan._id, 333.33);
  assert.equal(first.status, 201, first.body && first.body.message);
  assert.equal(first.body.payment.status, 'COMPLETED');

  let active = await request('GET', `/api/memberships/active/${member.user.id}`, { token });
  assert.equal(active.body.membership, null, 'one installment must not activate the membership');

  const second = await payPlan(token, member.user.id, plan._id, 333.33);
  assert.equal(second.status, 201, second.body && second.body.message);

  const wrongFinal = await payPlan(token, member.user.id, plan._id, 333.33);
  assert.equal(wrongFinal.status, 400);
  assert.match(wrongFinal.body.message, /next due installment is ₹333\.34/);

  const final = await payPlan(token, member.user.id, plan._id, 333.34);
  assert.equal(final.status, 201, final.body && final.body.message);

  active = await request('GET', `/api/memberships/active/${member.user.id}`, { token });
  assert.ok(active.body.membership, 'membership activates once the schedule is covered');
  assert.equal(active.body.membership.status, 'ACTIVE');

  const my = await request('GET', '/api/memberships/my', { token: member.token });
  assert.equal(my.body.memberships.length, 1, 'all installments share one membership');
  const membershipId = my.body.memberships[0]._id;

  const detail = await request('GET', `/api/memberships/${membershipId}`, { token });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.paidTotal, 1000);
  assert.equal(detail.body.remaining, 0);
});

test('paying the final (larger) amount first is rejected — it is not the next due installment', async () => {
  const { token } = await adminContext();
  const member = await registerMember();
  const plan = await createPlanApi(token, { paymentMode: 'INSTALLMENT', installments: 3 });

  const res = await payPlan(token, member.user.id, plan._id, 333.34);
  assert.equal(res.status, 400);
  assert.match(res.body.message, /next due installment is ₹333\.33/);
  assert.match(res.body.message, /final installment of ₹333\.34/);
});

test('GET /api/membership-plans exposes installmentSchedule and the offline-counter installmentPolicy', async () => {
  const { token } = await adminContext();
  const plan = await createPlanApi(token, { paymentMode: 'INSTALLMENT', installments: 3 });
  const fullPlan = await createPlanApi(token, {});

  const res = await request('GET', '/api/membership-plans', { token });
  assert.equal(res.status, 200);

  const found = res.body.plans.find((p) => p._id === plan._id);
  assert.ok(found, 'created plan present in GET /api/membership-plans');
  assert.equal(found.installmentSchedule.length, 3);
  assert.deepEqual(amounts(found), [333.33, 333.33, 333.34]);
  assert.equal(found.installmentPolicy.supported, true);
  assert.equal(found.installmentPolicy.mode, 'offline_counter_only');
  assert.equal(found.installmentPolicy.onlineInstallments, false);
  assert.match(found.installmentPolicy.note, /gym counter/);

  const fullFound = res.body.plans.find((p) => p._id === fullPlan._id);
  assert.ok(fullFound, 'full plan present in GET /api/membership-plans');
  assert.equal(fullFound.installmentPolicy.supported, false);
  assert.equal(fullFound.installmentPolicy.mode, 'online_full');
  assert.equal(fullFound.installmentPolicy.onlineInstallments, false);
});

test('getInstallmentSchedule / getNextDueInstallment unit assertions', async () => {
  const n3 = await createPlanModel({ price: 1000, installments: 3 });
  assert.equal(getInstallmentSchedule(n3).length, 3);
  assert.equal(getNextDueInstallment(n3, 0), 333.33);
  assert.equal(getNextDueInstallment(n3, 1), 333.33);
  assert.equal(getNextDueInstallment(n3, 2), 333.34);
  assert.equal(getNextDueInstallment(n3, 3), 333.34, 'out-of-range falls back to the final installment');

  const n4 = await createPlanModel({ price: 1000, installments: 4 });
  for (let i = 0; i < 4; i++) assert.equal(getNextDueInstallment(n4, i), 250);

  // Legacy fallback: schedule removed, uniform fields only.
  const legacy = await createPlanModel({ price: 1000, installments: 4 });
  legacy.installmentSchedule = [];
  assert.equal(getNextDueInstallment(legacy, 0), 250);
  assert.equal(getNextDueInstallment(legacy, 2), 250);

  // Legacy fallback with a distinct final installment (old non-uniform shape).
  const legacyFinal = await createPlanModel({ price: 1000, installments: 3 });
  legacyFinal.installmentSchedule = [];
  legacyFinal.installmentAmount = 333.33;
  legacyFinal.finalInstallmentAmount = 333.34;
  assert.equal(getNextDueInstallment(legacyFinal, 0), 333.33);
  assert.equal(getNextDueInstallment(legacyFinal, 2), 333.34);

  const full = await createPlanModel({ price: 1000, installments: 1, paymentMode: 'FULL' });
  assert.equal(getNextDueInstallment(full, 0), null);
  assert.equal(getNextDueInstallment(null, 0), null);
});