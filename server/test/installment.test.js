'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, request, registerMember, adminContext } = require('./helpers');

// Installment behaviour for manual (counter/cash/UPI) payments:
// - a COMPLETED payment must equal the fixed installment amount exactly
// - arbitrary partial amounts are rejected
// - overpayment past the plan price is rejected
// - the membership only becomes ACTIVE once the cumulative total reaches the
//   plan price
// Online (Razorpay) checkout always charges the full plan price, which fully
// closes an installment plan in one payment - asserted here as well.

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

const payPlan = async (token, userId, planId, amount) =>
  request('POST', '/api/payments', {
    token,
    body: { userId, planId, amount, method: 'cash', status: 'COMPLETED' },
  });

test('an arbitrary partial amount is rejected on an INSTALLMENT plan', async () => {
  const { token } = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(token, { paymentMode: 'INSTALLMENT', installments: 4 });

  const res = await payPlan(token, member.user.id, plan._id, 200);
  assert.equal(res.status, 400);
  assert.match(res.body.message, /fixed installments of ₹250/);
});

test('installments keep the membership PENDING until the plan price is covered', async () => {
  const { token } = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(token, { paymentMode: 'INSTALLMENT', installments: 4 });

  const first = await payPlan(token, member.user.id, plan._id, 250);
  assert.equal(first.status, 201, first.body && first.body.message);
  assert.equal(first.body.payment.status, 'COMPLETED');

  let active = await request('GET', `/api/memberships/active/${member.user.id}`, { token });
  assert.equal(active.body.membership, null, 'one installment must not activate the membership');

  for (let i = 2; i <= 4; i++) {
    const res = await payPlan(token, member.user.id, plan._id, 250);
    assert.equal(res.status, 201, res.body && res.body.message);
  }

  active = await request('GET', `/api/memberships/active/${member.user.id}`, { token });
  assert.ok(active.body.membership, 'membership activates once fully covered');
  assert.equal(active.body.membership.status, 'ACTIVE');
});

test('installments are reused against the same PENDING membership (no duplicates)', async () => {
  const { token } = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(token, { paymentMode: 'INSTALLMENT', installments: 2 });

  await payPlan(token, member.user.id, plan._id, 500);
  await payPlan(token, member.user.id, plan._id, 500);

  const my = await request('GET', '/api/memberships/my', { token: member.token });
  assert.equal(my.body.memberships.length, 1, 'all installments share one membership');
});

test('a third installment beyond the plan price is rejected as overpayment', async () => {
  const { token } = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(token, { paymentMode: 'INSTALLMENT', installments: 2 });

  await payPlan(token, member.user.id, plan._id, 500);
  await payPlan(token, member.user.id, plan._id, 500);

  const boom = await payPlan(token, member.user.id, plan._id, 500);
  assert.equal(boom.status, 400);
  assert.match(boom.body.message, /Overpayment rejected/);
});

test('a FULL plan still requires the exact price regardless of installment fields', async () => {
  const { token } = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(token);

  const wrong = await payPlan(token, member.user.id, plan._id, 500);
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.message, /does not match/);

  const good = await payPlan(token, member.user.id, plan._id, 1000);
  assert.equal(good.status, 201, good.body && good.body.message);

  const active = await request('GET', `/api/memberships/active/${member.user.id}`, { token });
  assert.equal(active.body.membership.status, 'ACTIVE');
});

test('admin shows paid/remaining for an installment membership', async () => {
  const { token } = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(token, { paymentMode: 'INSTALLMENT', installments: 4 });

  await payPlan(token, member.user.id, plan._id, 250);
  await payPlan(token, member.user.id, plan._id, 250);

  const my = await request('GET', '/api/memberships/my', { token: member.token });
  const membershipId = my.body.memberships[0]._id;

const detail = await request('GET', `/api/memberships/${membershipId}`, { token });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.paidTotal, 500);
  assert.equal(detail.body.remaining, 500);
  assert.equal(detail.body.membership.plan.price, 1000);
});

test('a counter payment can never be a random full amount on an INSTALLMENT plan', async () => {
  const { token } = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(token, { paymentMode: 'INSTALLMENT', installments: 4 });

  const full = await payPlan(token, member.user.id, plan._id, 1000);
  assert.equal(full.status, 400);
  assert.match(full.body.message, /fixed installments of ₹250/);
});

test('a gateway-confirmed full-price payment closes an installment plan in one shot', async () => {
  // The online (Razorpay) path charges plan.price regardless of installment
  // mode and activates immediately through completeGatewayPayment ->
  // activateMembershipFromPayment. It bypasses manual-payment validation on
  // purpose; installments are a counter/membership-admin concern.
  const { token } = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(token, { paymentMode: 'INSTALLMENT', installments: 4 });

  const Payment = require('../models/Payment');
  const Membership = require('../models/Membership');
  const { completeGatewayPayment } = require('../utils/paymentLifecycle');

  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + plan.duration);
  const membership = await Membership.create({
    user: member.user.id,
    plan: plan._id,
    startDate: start,
    endDate: end,
    status: 'PENDING',
  });
  const payment = await Payment.create({
    user: member.user.id,
    membership: membership._id,
    amount: 1000,
    method: 'online',
    status: 'PENDING',
    gateway: 'razorpay',
    date: new Date(),
  });

  const result = await completeGatewayPayment(payment._id, {
    gatewayStatus: 'captured',
    gatewayPaymentId: 'pay_test_installment',
  });
  assert.equal(result.outcome, 'completed');

  const active = await request('GET', `/api/memberships/active/${member.user.id}`, { token });
  assert.ok(active.body.membership, 'a full gateway payment closes the installment plan');
  assert.equal(active.body.membership.status, 'ACTIVE');
});