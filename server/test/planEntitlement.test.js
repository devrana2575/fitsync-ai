'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, request, registerMember, adminContext } = require('./helpers');

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

test('plan defaults to FULL payment with no trainer entitlement', async () => {
  const { token } = await adminContext();
  const plan = await createPlan(token);
  assert.equal(plan.paymentMode, 'FULL');
  assert.equal(plan.installments, 1);
  assert.equal(plan.installmentAmount, 0);
  assert.equal(plan.trainerIncluded, false);
  assert.equal(plan.trainerAllocationMode, 'NONE');
  assert.equal(plan.workoutPlanIncluded, false);
});

test('INSTALLMENT plan stores a fixed per-installment amount derived from the price', async () => {
  const { token } = await adminContext();
  const plan = await createPlan(token, { paymentMode: 'INSTALLMENT', installments: 4 });
  assert.equal(plan.paymentMode, 'INSTALLMENT');
  assert.equal(plan.installments, 4);
  assert.equal(plan.installmentAmount, 250);
});

test('INSTALLMENT with fewer than 2 installments is rejected', async () => {
  const { token } = await adminContext();
  const res = await request('POST', '/api/membership-plans', {
    token,
    body: { name: uniqueName('Plan'), price: 1000, duration: 30, paymentMode: 'INSTALLMENT', installments: 1 },
  });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /at least 2/);
});

test('trainer entitlement config is persisted on the plan', async () => {
  const { token } = await adminContext();
  const plan = await createPlan(token, {
    trainerIncluded: true,
    trainerAllocationMode: 'ASSIGNED',
    requiredSpecialization: 'Weight Loss',
    workoutPlanIncluded: true,
  });
  assert.equal(plan.trainerIncluded, true);
  assert.equal(plan.trainerAllocationMode, 'ASSIGNED');
  assert.equal(plan.requiredSpecialization, 'Weight Loss');
  assert.equal(plan.workoutPlanIncluded, true);
});

test('trainerAllocationMode is forced to NONE when trainer support is not included', async () => {
  const { token } = await adminContext();
  const plan = await createPlan(token, { trainerAllocationMode: 'DEDICATED' });
  assert.equal(plan.trainerIncluded, false);
  assert.equal(plan.trainerAllocationMode, 'NONE');
});

test('price edits re-derive the stored installment amount', async () => {
  const { token } = await adminContext();
  const plan = await createPlan(token, { paymentMode: 'INSTALLMENT', installments: 3 });
  assert.equal(plan.installmentAmount, 333.33);

  const upd = await request('PUT', `/api/membership-plans/${plan._id}`, {
    token,
    body: { price: 1200 },
  });
  assert.equal(upd.status, 200, upd.body && upd.body.message);
  assert.equal(upd.body.plan.installmentAmount, 400);
});

test('update rejects a switch to INSTALLMENT without a valid installment count', async () => {
  const { token } = await adminContext();
  const plan = await createPlan(token);
  const upd = await request('PUT', `/api/membership-plans/${plan._id}`, {
    token,
    body: { paymentMode: 'INSTALLMENT', installments: 1 },
  });
  assert.equal(upd.status, 400);
  assert.match(upd.body.message, /at least 2/);
});

test('member-facing plan list includes the config fields', async () => {
  const { token } = await adminContext();
  const plan = await createPlan(token, { trainerIncluded: true, workoutPlanIncluded: true });
  const member = await registerMember();
  const list = await request('GET', '/api/membership-plans', { token: member.token });
  const found = list.body.plans.find((p) => String(p._id) === String(plan._id));
  assert.ok(found);
  assert.equal(found.trainerIncluded, true);
  assert.equal(typeof found.trainerAllocationMode, 'string');
  assert.equal(typeof found.paymentMode, 'string');
});