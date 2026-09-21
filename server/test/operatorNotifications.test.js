'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, request, registerMember, adminContext, uniqueEmail } = require('./helpers');

const User = require('../models/User');
const TrainerProfile = require('../models/TrainerProfile');
const MemberProfile = require('../models/MemberProfile');
const Notification = require('../models/Notification');

let baseUrl;
before(async () => {
  ({ baseUrl } = await setup());
});
after(teardown);

test('a reported equipment issue flags the equipment and notifies admins', async () => {
  const { token } = await adminContext();

  const equipment = await (async () => {
    const res = await request('POST', '/api/equipment', {
      token,
      body: { name: 'Treadmill 1', category: 'cardio', status: 'available' },
    });
    return res.body.equipment;
  })();

  const report = await request('POST', `/api/equipment/${equipment._id}/issue-report`, {
    token,
    body: { reportedIssue: 'Belt slips during use' },
  });
  assert.equal(report.status, 201, report.body && report.body.message);
  assert.equal(report.body.equipment.status, 'issue_reported');
  assert.ok(report.body.equipment.reportedAt);

  const admin = await User.findOne({ role: 'admin', isActive: true });
  const notice = await Notification.findOne({ user: admin._id, type: 'equipment_maintenance' });
  assert.ok(notice, 'admin is notified about the equipment issue');
  assert.match(notice.message, /Belt slips/);
});

test('moving equipment into maintenance notifies admins', async () => {
  const { token } = await adminContext();

  const equipment = await (async () => {
    const res = await request('POST', '/api/equipment', {
      token,
      body: { name: 'Squat Rack', category: 'strength', status: 'available' },
    });
    return res.body.equipment;
  })();

  const upd = await request('PUT', `/api/equipment/${equipment._id}`, {
    token,
    body: { status: 'under_maintenance' },
  });
  assert.equal(upd.status, 200);

  const admin = await User.findOne({ role: 'admin', isActive: true });
  const notice = await Notification.findOne({ user: admin._id, type: 'equipment_maintenance', message: /Squat Rack/ });
  assert.ok(notice, 'admins see the maintenance status change');
});

test('marking a trainer unavailable notifies their assigned members and admins', async () => {
  const { token } = await adminContext();

  const trainer = await User.create({ name: 'Leave Trainer', email: uniqueEmail('trainer'), password: 'Trainer@123', role: 'trainer' });
  await TrainerProfile.create({ user: trainer._id, phone: '9876543210', isAvailable: true });

  const member = await registerMember();
  const profile = await MemberProfile.findOne({ user: member.user.id });
  profile.assignedTrainer = trainer._id;
  profile.trainerAssignmentStatus = 'ASSIGNED';
  await profile.save();

  const upd = await request('PUT', `/api/trainers/${trainer._id}/availability`, {
    token,
    body: { isAvailable: false, reason: 'On medical leave', from: '2026-09-21', to: '2026-09-25' },
  });
  assert.equal(upd.status, 200, upd.body && upd.body.message);
  assert.equal(upd.body.profile.isAvailable, false);
  assert.equal(upd.body.profile.absenceReason, 'On medical leave');

  const memberNotice = await Notification.findOne({ user: member.user.id, type: 'trainer_absent' });
  assert.ok(memberNotice, 'assigned member is notified about the absence');
  assert.match(memberNotice.message, /Leave Trainer/);

  const admin = await User.findOne({ role: 'admin', isActive: true });
  const adminNotice = await Notification.findOne({ user: admin._id, type: 'trainer_absent', message: /Leave Trainer/ });
  assert.ok(adminNotice, 'admins see the absence');
});

test('trainers can mark their own availability; allocation excludes them while away', async () => {
  const { token } = await adminContext();

  const trainer = await User.create({ name: 'Self Trainer', email: uniqueEmail('trainer'), password: 'Trainer@123', role: 'trainer' });
  await TrainerProfile.create({ user: trainer._id, phone: '9876543210', specializations: ['Strength'], isAvailable: true });

  const trainerToken = (await request('POST', '/api/auth/login', { body: { email: trainer.email, password: 'Trainer@123' } })).body.token;
  const away = await request('PUT', '/api/trainers/me/availability', {
    token: trainerToken,
    body: { isAvailable: false, reason: 'Vacation' },
  });
  assert.equal(away.status, 200, away.body && away.body.message);
  assert.equal(away.body.profile.isAvailable, false);
  assert.equal(away.body.profile.absenceReason, 'Vacation');

  // A plan requiring this trainer's specialization cannot be allocated while away.
  const plan = await (async () => {
    const res = await request('POST', '/api/membership-plans', {
      token,
      body: { name: `AwayPlan ${Date.now()}`, price: 1000, duration: 30, trainerIncluded: true, requiredSpecialization: 'Strength' },
    });
    return res.body.plan;
  })();

  const member = await registerMember();
  const pay = await request('POST', '/api/payments', {
    token,
    body: { userId: member.user.id, planId: plan._id, amount: 1000, method: 'cash', status: 'COMPLETED' },
  });
  assert.equal(pay.status, 201, pay.body && pay.body.message);

  const memberProfile = await MemberProfile.findOne({ user: member.user.id });
  assert.equal(memberProfile.trainerAssignmentStatus, 'PENDING', 'away trainer is not selectable');

  // Back to work - a new full-paid member can be allocated to them.
  const back = await request('PUT', '/api/trainers/me/availability', {
    token: trainerToken,
    body: { isAvailable: true },
  });
  assert.equal(back.body.profile.isAvailable, true);

  const secondMember = await registerMember();
  const pay2 = await request('POST', '/api/payments', {
    token,
    body: { userId: secondMember.user.id, planId: plan._id, amount: 1000, method: 'cash', status: 'COMPLETED' },
  });
  assert.equal(pay2.status, 201, pay2.body && pay2.body.message);

  const profile2 = await MemberProfile.findOne({ user: secondMember.user.id });
  assert.equal(profile2.trainerAssignmentStatus, 'ASSIGNED');
  assert.equal(String(profile2.assignedTrainer), String(trainer._id));
});