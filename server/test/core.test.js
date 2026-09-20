'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, request, registerMember, adminContext, uniqueEmail } = require('./helpers');
const { expireMemberships } = require('../utils/cron');
const { setGymTimezone, getGymTimezone } = require('../utils/gymTime');
const User = require('../models/User');
const Membership = require('../models/Membership');
const MembershipPlan = require('../models/MembershipPlan');
const Payment = require('../models/Payment');
const Attendance = require('../models/Attendance');

let baseUrl;
before(async () => {
  ({ baseUrl } = await setup());
});
after(teardown);

let planCounter = 0;
const uniquePlanName = (base) => `${base} ${++planCounter} (${Date.now()})`;

const createPlan = async (adminToken, over = {}) => {
  const res = await request('POST', '/api/membership-plans', {
    token: adminToken,
    body: { name: uniquePlanName('Monthly'), price: 1000, duration: 30, description: '30 day plan', ...over },
  });
  assert.equal(res.status, 201, res.body && res.body.message);
  return res.body.plan;
};

test('registration hardcodes member role; member can read settings', async () => {
  const admin = await adminContext();
  assert.ok(admin.token);

  const member = await registerMember();
  assert.equal(member.status, 201);
  assert.equal(member.user.role, 'member');
  assert.ok(member.token);

  const settings = await request('GET', '/api/settings', { token: member.token });
  assert.equal(settings.status, 200);
  assert.ok(settings.body.settings);
  assert.equal(settings.body.payment.method, 'upi', 'test env has a real UPI id');
  assert.equal(typeof settings.body.payment.upiId, 'string');
});

test('AllData cannot escalate roles or flip membership/payment status', async () => {
  const { token } = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(token);

  // role escalation via AllData is ignored
  const roleEdit = await request('PUT', `/api/admin/all/users/${member.user.id}`, {
    token,
    body: { name: 'Renamed Member', role: 'admin' },
  });
  assert.equal(roleEdit.status, 200);
  const updatedUser = await User.findById(member.user.id).select('name role').lean();
  assert.equal(updatedUser.name, 'Renamed Member');
  assert.equal(updatedUser.role, 'member', 'role must never change through AllData');

  // membership creation without complimentary stays PENDING
  const assign = await request('POST', '/api/memberships', {
    token,
    body: { userId: member.user.id, planId: plan._id },
  });
  assert.equal(assign.status, 201);
  assert.equal(assign.body.membership.status, 'PENDING');

  // status flip via AllData is ignored
  await request('PUT', `/api/admin/all/memberships/${assign.body.membership._id}`, {
    token,
    body: { status: 'ACTIVE' },
  });
  const membershipAfter = await Membership.findById(assign.body.membership._id).select('status').lean();
  assert.equal(membershipAfter.status, 'PENDING', 'membership status must not be editable via AllData');

  const active = await request('GET', `/api/memberships/active/${member.user.id}`, { token });
  assert.equal(active.body.membership, null, 'pending membership must not grant active status');
});

test('member without active membership cannot check in (manual or QR)', async () => {
  const { token } = await adminContext();
  const member = await registerMember();

  const manual = await request('POST', '/api/attendance/checkin', {
    token,
    body: { userId: member.user.id, method: 'manual' },
  });
  assert.equal(manual.status, 403);
  assert.match(manual.body.message, /membership/i);

  const qr = await request('POST', '/api/attendance/qr-checkin', { token: member.token });
  assert.equal(qr.status, 403);
  assert.match(qr.body.message, /membership/i);
});

test('payment with wrong amount is rejected; correct amount activates the PENDING membership', async () => {
  const { token } = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(token);

  const assign = await request('POST', '/api/memberships', {
    token,
    body: { userId: member.user.id, planId: plan._id },
  });
  const membershipId = assign.body.membership._id;

  const wrong = await request('POST', '/api/payments', {
    token,
    body: { userId: member.user.id, membershipId, amount: 999, method: 'cash', status: 'COMPLETED' },
  });
  assert.equal(wrong.status, 400, 'wrong amount must not activate a plan');

  const good = await request('POST', '/api/payments', {
    token,
    body: { userId: member.user.id, membershipId, amount: 1000, method: 'cash', status: 'COMPLETED' },
  });
  assert.equal(good.status, 201);
  assert.equal(good.body.payment.status, 'COMPLETED');
  assert.ok(good.body.payment.confirmedBy, 'completed payment records confirmor');

  const active = await request('GET', `/api/memberships/active/${member.user.id}`, { token });
  assert.equal(active.body.membership.status, 'ACTIVE', 'payment must activate membership');
});

test('active member can check in once per gym day; duplicate is clean 400', async () => {
  const { token } = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(token);

  const pay = await request('POST', '/api/payments', {
    token,
    body: { userId: member.user.id, planId: plan._id, amount: 1000, method: 'cash', status: 'COMPLETED' },
  });
  assert.equal(pay.status, 201);

  const manual = await request('POST', '/api/attendance/checkin', {
    token,
    body: { userId: member.user.id, method: 'manual' },
  });
  assert.equal(manual.status, 201);

  const dup = await request('POST', '/api/attendance/checkin', {
    token,
    body: { userId: member.user.id, method: 'manual' },
  });
  assert.equal(dup.status, 400);
  assert.match(dup.body.message, /already checked in/i);

  const today = await request('GET', '/api/attendance/today', { token });
  assert.equal(today.body.count, 1);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(today.body.records[0].dayKey), 'records carry a gym-local dayKey');
});

test('concurrent duplicate QR check-ins produce exactly one record', async () => {
  const admin = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(admin.token);

  const pay = await request('POST', '/api/payments', {
    token: admin.token,
    body: { userId: member.user.id, planId: plan._id, amount: 1000, method: 'cash', status: 'COMPLETED' },
  });
  assert.equal(pay.status, 201);

  const results = await Promise.all([
    request('POST', '/api/attendance/qr-checkin', { token: member.token }),
    request('POST', '/api/attendance/qr-checkin', { token: member.token }),
  ]);

  const created = results.filter((r) => r.status === 201 && r.body.attendance).length;
  const bodies = results.map((r) => ({ status: r.status, msg: r.body && r.body.message }));
  assert.equal(created, 1, `expected exactly one created record, got ${JSON.stringify(bodies)}`);

  const records = await Attendance.countDocuments({ user: member.user.id });
  assert.equal(records, 1, 'single attendance record for the gym day');

  const today = await request('GET', '/api/attendance/today', { token: admin.token });
  assert.ok(today.body.count >= 1, 'today list counts the gym day correctly');
  const myRecord = today.body.records.find((r) => String(r.user && r.user._id) === String(member.user.id));
  assert.ok(myRecord, 'the concurrent check-in appears exactly once for the member');
});

test('membership ending later today still allows check-in; expired one does not', async () => {
  const { token } = await adminContext();
  const plan = await createPlan(token);

  const endsToday = await registerMember();
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60 * 1000);
  await Membership.create({ user: endsToday.user.id, plan: plan._id, startDate: now, endDate: later, status: 'ACTIVE' });
  const ok = await request('POST', '/api/attendance/qr-checkin', { token: endsToday.token });
  assert.equal(ok.status, 201, 'membership ending later today is not expired');

  const expiredMember = await registerMember();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await Membership.create({ user: expiredMember.user.id, plan: plan._id, startDate: past, endDate: yesterday, status: 'ACTIVE' });

  await expireMemberships();

  const expired = await Membership.findOne({ user: expiredMember.user.id }).select('status').lean();
  assert.equal(expired.status, 'EXPIRED', 'auto-expiry sweep still flips status');

  const blocked = await request('POST', '/api/attendance/qr-checkin', { token: expiredMember.token });
  assert.equal(blocked.status, 403);
  assert.match(blocked.body.message, /membership/i);
});

test('UPI flow: member claim keeps PENDING; admin verify completes and activates', async () => {
  const admin = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(admin.token);

  const checkout = await request('POST', '/api/checkout/create', { token: member.token, body: { planId: plan._id } });
  assert.equal(checkout.status, 201);
  assert.equal(checkout.body.mode, 'upi');
  const paymentId = checkout.body.payment;
  const membershipId = checkout.body.membership;

  const qr = await request('GET', `/api/checkout/upi/qr/${paymentId}`, { token: member.token });
  assert.equal(qr.status, 200);

  const claim = await request('POST', `/api/checkout/upi/confirm/${paymentId}`, { token: member.token });
  assert.equal(claim.status, 200);
  assert.match(claim.body.message, /verification/i);

  const still = await Payment.findById(paymentId).select('status').lean();
  assert.equal(still.status, 'PENDING', 'member click must NOT complete the payment');
  const membershipStill = await Membership.findById(membershipId).select('status').lean();
  assert.equal(membershipStill.status, 'PENDING', 'membership stays pending until verification');

  const verify = await request('POST', `/api/payments/${paymentId}/verify`, { token: admin.token });
  assert.equal(verify.status, 200);
  assert.equal(verify.body.payment.status, 'COMPLETED');

  const verified = await Payment.findById(paymentId).select('confirmedBy confirmedAt').lean();
  assert.ok(verified.confirmedBy, 'verify records the confirming admin');
  assert.ok(verified.confirmedAt, 'verify records the timestamp');

  const active = await request('GET', `/api/memberships/active/${member.user.id}`, { token: admin.token });
  assert.equal(active.body.membership.status, 'ACTIVE');

  const checkin = await request('POST', '/api/attendance/qr-checkin', { token: member.token });
  assert.equal(checkin.status, 201);
});

test('member confirmation of UPI payment cannot auto-complete in a non-UPI payment', async () => {
  const admin = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(admin.token);

  const pay = await request('POST', '/api/payments', {
    token: admin.token,
    body: { userId: member.user.id, planId: plan._id, amount: plan.price, method: 'cash', status: 'PENDING' },
  });
  assert.equal(pay.status, 201);

  const claim = await request('POST', `/api/checkout/upi/confirm/${pay.body.payment._id}`, { token: member.token });
  assert.equal(claim.status, 400, 'cash payment is not a UPI payment');
});

test('refunding a payment cancels the linked membership', async () => {
  const admin = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(admin.token);

  const pay = await request('POST', '/api/payments', {
    token: admin.token,
    body: { userId: member.user.id, planId: plan._id, amount: 1000, method: 'cash', status: 'COMPLETED' },
  });
  const membershipId = pay.body.payment.membership;

  const active = await Membership.findById(membershipId).select('status').lean();
  assert.equal(active.status, 'ACTIVE');

  const refund = await request('PUT', `/api/payments/${pay.body.payment._id}`, {
    token: admin.token,
    body: { status: 'REFUNDED' },
  });
  assert.equal(refund.body.payment.status, 'REFUNDED');

  const after = await Membership.findById(membershipId).select('status').lean();
  assert.equal(after.status, 'CANCELLED', 'refund must revoke active access');

  const blocked = await request('POST', '/api/attendance/qr-checkin', { token: member.token });
  assert.equal(blocked.status, 403);
});

test('renew requires explicit admin acknowledgement', async () => {
  const admin = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(admin.token);

  const pay = await request('POST', '/api/payments', {
    token: admin.token,
    body: { userId: member.user.id, planId: plan._id, amount: 1000, method: 'cash', status: 'COMPLETED' },
  });
  const membershipId = pay.body.payment.membership;

  const without = await request('PUT', `/api/memberships/${membershipId}/renew`, { token: admin.token, body: {} });
  assert.equal(without.status, 400, 'renew without acknowledgement must fail');

  const withAck = await request('PUT', `/api/memberships/${membershipId}/renew`, {
    token: admin.token,
    body: { acknowledged: true },
  });
  assert.equal(withAck.status, 200);
  assert.equal(withAck.body.membership.status, 'ACTIVE');
});

test('complementary flag is the only way to activate via the memberships API', async () => {
  const admin = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(admin.token);

  const comp = await request('POST', '/api/memberships', {
    token: admin.token,
    body: { userId: member.user.id, planId: plan._id, complimentary: true },
  });
  assert.equal(comp.status, 201);
  assert.equal(comp.body.membership.status, 'ACTIVE', 'explicit complimentary grant activates');

  const checkin = await request('POST', '/api/attendance/qr-checkin', { token: member.token });
  assert.equal(checkin.status, 201);
});

test('settings are admin-only for writes and validate the timezone', async () => {
  const admin = await adminContext();
  const member = await registerMember();

  const memberPut = await request('PUT', '/api/settings', { token: member.token, body: { name: 'Hijack' } });
  assert.equal(memberPut.status, 403);

  const noTz = await request('PUT', '/api/settings', { token: admin.token, body: { timezone: 'Mars/Olympus' } });
  assert.equal(noTz.status, 400, 'invalid timezone must be rejected');

  const ok = await request('PUT', '/api/settings', {
    token: admin.token,
    body: { name: 'Test Gym', timezone: 'Asia/Karachi' },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.settings.timezone, 'Asia/Karachi');

  assert.equal(getGymTimezone(), 'Asia/Karachi', 'in-memory timezone cache stays in sync');
  setGymTimezone('Asia/Kolkata');

  const get = await request('GET', '/api/settings', { token: member.token });
  assert.equal(get.body.settings.name, 'Test Gym');
  assert.equal(get.body.settings.timezone, 'Asia/Karachi');
  assert.equal(get.body.payment.method, 'upi');
});

test('revenue trend returns the latest 12 months ascending', async () => {
  const admin = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(admin.token);

  // create two completed payments with deterministically different months by
  // backdating their date fields
  const first = await request('POST', '/api/payments', {
    token: admin.token,
    body: { userId: member.user.id, planId: plan._id, amount: 1000, method: 'cash', status: 'COMPLETED' },
  });
  const second = await request('POST', '/api/payments', {
    token: admin.token,
    body: { userId: member.user.id, planId: plan._id, amount: 1000, method: 'cash', status: 'COMPLETED' },
  });
  await Payment.updateOne({ _id: first.body.payment._id }, { $set: { date: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) } });
  await Payment.updateOne({ _id: second.body.payment._id }, { $set: { date: new Date() } });

  const trend = await request('GET', '/api/analytics/admin/revenue-trend', { token: admin.token });
  assert.equal(trend.status, 200);
  assert.ok(Array.isArray(trend.body.trend));
  assert.ok(trend.body.trend.length >= 2);
  const keys = trend.body.trend.map((t) => `${t._id.year}-${t._id.month}`);
  const sorted = [...keys].sort();
  assert.deepEqual(keys, sorted, 'trend must be ascending');
  assert.equal(trend.body.trend.length <= 12, true, 'only the latest 12 months');
});

test('gym timezone controls analytics/dashboard day boundaries via attendance dayKey', async () => {
  const admin = await adminContext();
  const member = await registerMember();
  const plan = await createPlan(admin.token);

  const pay = await request('POST', '/api/payments', {
    token: admin.token,
    body: { userId: member.user.id, planId: plan._id, amount: 1000, method: 'cash', status: 'COMPLETED' },
  });
  assert.equal(pay.status, 201);

  // attendance created through the API gets a dayKey derived from the gym tz
  const checkin = await request('POST', '/api/attendance/checkin', {
    token: admin.token,
    body: { userId: member.user.id, method: 'manual' },
  });
  assert.equal(checkin.status, 201);
  const record = await Attendance.findById(checkin.body.attendance._id).select('dayKey').lean();
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(record.dayKey), 'dayKey is a YYYY-MM-DD gym-local key');

  const stats = await request('GET', '/api/attendance/stats', { token: admin.token });
  assert.equal(stats.status, 200);
  assert.ok(stats.body.todayCount >= 1, 'stats compute today count from gym day boundaries');
});

test('admin cannot activate another admin through membership assignment (authz sanity)', async () => {
  const admin = await adminContext();
  const targetAdmin = await User.create({ name: 'Other', email: uniqueEmail('admin'), password: 'Admin@123', role: 'admin' });
  const plan = await createPlan(admin.token);

  const res = await request('POST', '/api/payments', {
    token: admin.token,
    body: { userId: targetAdmin._id, planId: plan._id, amount: 1000, method: 'cash', status: 'COMPLETED' },
  });
  assert.equal(res.status, 400, 'role check prevents assigning memberships to administrators');

  const member = await registerMember();
  const planRes = await request('POST', '/api/membership-plans', {
    token: admin.token,
    body: { name: uniquePlanName('Gold'), price: 2000, duration: 60 },
  });
  const pay2 = await request('POST', '/api/payments', {
    token: admin.token,
    body: { userId: member.user.id, planId: planRes.body.plan._id, amount: 1999, method: 'cash', status: 'COMPLETED' },
  });
  assert.equal(pay2.status, 400, 'plan amount mismatch rejected');
});