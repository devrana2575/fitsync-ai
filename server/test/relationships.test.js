'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, request, registerMember, adminContext, uniqueEmail } = require('./helpers');

const User = require('../models/User');
const MemberProfile = require('../models/MemberProfile');
const Membership = require('../models/Membership');
const MembershipPlan = require('../models/MembershipPlan');
const Payment = require('../models/Payment');
const Attendance = require('../models/Attendance');

let baseUrl;
before(async () => {
  ({ baseUrl } = await setup());
});
after(teardown);

const seededMember = async () => {
  const { user } = await registerMember();
  const plan = await MembershipPlan.create({
    name: `Plan ${uniqueEmail('plan')}`,
    price: 1000,
    duration: 30,
  });
  const membership = await Membership.create({
    user: user.id,
    plan: plan._id,
    startDate: new Date(),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    status: 'ACTIVE',
  });
  const payment = await Payment.create({
    user: user.id,
    membership: membership._id,
    amount: 1000,
    method: 'cash',
    status: 'COMPLETED',
  });
  return { user, plan, membership, payment };
};

test('deleting a user is a soft-delete that preserves all history', async () => {
  const { user, membership, payment } = await seededMember();
  const admin = await adminContext();

  const res = await request('DELETE', `/api/users/${user.id}`, { token: admin.token });
  assert.equal(res.status, 200);

  const stillThere = await User.findById(user.id).lean();
  assert.ok(stillThere, 'user record must still exist');
  assert.equal(stillThere.isActive, false);

  const membershipStillThere = await Membership.findById(membership._id).lean();
  const paymentStillThere = await Payment.findById(payment._id).lean();
  const profileStillThere = await MemberProfile.findOne({ user: user.id }).lean();
  assert.ok(membershipStillThere, 'membership history preserved');
  assert.ok(paymentStillThere, 'payment history preserved');
  assert.ok(profileStillThere, 'profile preserved');

  const reactivate = await request('PUT', `/api/users/${user.id}/activate`, { token: admin.token });
  assert.equal(reactivate.status, 200);
  assert.equal((await User.findById(user.id)).isActive, true);
});

test('a recorded measurement updates the member profile current weight/height', async () => {
  const member = await registerMember();
  const res = await request('POST', '/api/measurements', {
    token: member.token,
    body: { weight: 72.5, height: 175 },
  });
  assert.equal(res.status, 201);

  const profile = await MemberProfile.findOne({ user: member.user.id }).lean();
  assert.equal(profile.weightKg, 72.5);
  assert.equal(profile.heightCm, 175);

  const latest = await request('GET', '/api/auth/me', { token: member.token });
  assert.equal(latest.body.profile.weightKg, 72.5);
});

test('AllData cannot hard-delete records that other records reference', async () => {
  const { user, plan, membership } = await seededMember();
  const profile = await MemberProfile.findOne({ user: user.id });
  const admin = await adminContext();

  const deleteUser = await request('DELETE', `/api/admin/all/users/${user.id}`, { token: admin.token });
  assert.equal(deleteUser.status, 400);

  const deleteProfile = await request('DELETE', `/api/admin/all/memberProfiles/${profile._id}`, { token: admin.token });
  assert.equal(deleteProfile.status, 400);

  const deletePlan = await request('DELETE', `/api/admin/all/membershipPlans/${plan._id}`, { token: admin.token });
  assert.equal(deletePlan.status, 400);
  assert.match(deletePlan.body.message, /reference this plan/);
  assert.ok(await Membership.findById(membership._id), 'plan still referenced -> not deleted');

  const deleteMembership = await request('DELETE', `/api/admin/all/memberships/${membership._id}`, { token: admin.token });
  assert.equal(deleteMembership.status, 400);
  assert.match(deleteMembership.body.message, /reference this membership/);
});

test('AllData may delete unreferenced leaf and parent records', async () => {
  const admin = await adminContext();

  const orphanPlan = await MembershipPlan.create({
    name: `Plan ${uniqueEmail('leaf')}`,
    price: 500,
    duration: 15,
  });
  const deleteOrphanPlan = await request('DELETE', `/api/admin/all/membershipPlans/${orphanPlan._id}`, { token: admin.token });
  assert.equal(deleteOrphanPlan.status, 200);

  const member = await registerMember();
  const attendance = await Attendance.create({ user: member.user.id, checkInTime: new Date(), dayKey: '2026-09-22' });
  const deleteAttendance = await request('DELETE', `/api/admin/all/attendances/${attendance._id}`, { token: admin.token });
  assert.equal(deleteAttendance.status, 200);
  assert.equal(await Attendance.findById(attendance._id), null);
});
