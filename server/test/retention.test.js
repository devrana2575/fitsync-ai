'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, teardown, request, adminContext, createTrainer, login, uniqueEmail } = require('./helpers');

const User = require('../models/User');
const MembershipPlan = require('../models/MembershipPlan');
const Membership = require('../models/Membership');
const Attendance = require('../models/Attendance');
const Payment = require('../models/Payment');
const BodyMeasurement = require('../models/BodyMeasurement');
const Notification = require('../models/Notification');
const { buildPlanSnapshot } = require('../utils/planSnapshot');
const { getGymDateKey, getGymDayStartOnDateKey, setGymTimezone } = require('../utils/gymTime');
const {
  buildRetentionMembers,
  generateRetentionNotifications,
  gymDayDiff,
  shiftDayKey
} = require('../utils/retention');

const NOW = new Date('2026-06-15T10:00:00+05:30');
const REAL_NOW = new Date();
let baseUrl;

before(async () => {
  ({ baseUrl } = await setup());
  setGymTimezone('Asia/Kolkata');
});
after(teardown);

let counter = 0;

const dayDate = (offset, base = NOW) => {
  const key = shiftDayKey(getGymDateKey(base), offset);
  return new Date(getGymDayStartOnDateKey(key).getTime() + 12 * 60 * 60 * 1000);
};

const makeMember = async (label = 'Retention Member', base = NOW) => {
  counter += 1;
  return User.create({
    name: `${label} ${counter}`,
    email: uniqueEmail('retention'),
    password: 'Member@123',
    role: 'member',
    createdAt: base
  });
};

const makePlan = async (overrides = {}) => {
  counter += 1;
  return MembershipPlan.create({
    name: `Retention Plan ${counter} ${Date.now()}`,
    price: 1000,
    duration: 120,
    ...overrides
  });
};

const makeMembership = async (user, {
  plan,
  startOffset = -100,
  endOffset = 60,
  status = 'ACTIVE',
  trainerId = null,
  base = NOW
} = {}) => {
  const selectedPlan = plan || await makePlan();
  const startDate = dayDate(startOffset, base);
  const trainerAssignment = trainerId
    ? {
        assignmentInitialized: true,
        originalTrainer: trainerId,
        currentTrainer: trainerId,
        status: 'ASSIGNED',
        assignedAt: startDate
      }
    : undefined;
  return Membership.create({
    user: user._id,
    plan: selectedPlan._id,
    startDate,
    endDate: dayDate(endOffset, base),
    status,
    activatedAt: status === 'ACTIVE' ? startDate : null,
    planSnapshot: buildPlanSnapshot(selectedPlan),
    trainerAssignment
  });
};

const checkIn = async (user, offset, base = NOW) => {
  const date = dayDate(offset, base);
  return Attendance.create({
    user: user._id,
    date,
    dayKey: getGymDateKey(date),
    checkInTime: date,
    method: 'manual'
  });
};

const measure = async (user, offset, base = NOW) => {
  const date = dayDate(offset, base);
  return BodyMeasurement.create({ user: user._id, date, weight: 70, height: 170 });
};

const addPayment = async (user, {
  status = 'PENDING',
  offset = -2,
  amount = 500,
  base = NOW
} = {}) => Payment.create({
  user: user._id,
  amount,
  method: 'upi',
  status,
  date: dayDate(offset, base)
});

const buildOne = async (user, options = {}) => {
  const records = await buildRetentionMembers({
    now: options.now || NOW,
    memberIds: [String(user._id)],
    includePayments: options.includePayments !== false
  });
  return records;
};

const alertCodes = (member) => (member.alerts || []).map((alert) => alert.code);

const notificationWithKey = (key) => Notification.findOne({ 'data.retentionKey': key }).lean();

test('a member absent for more than 7 days gets a low-attendance alert and one reminder', async () => {
  const member = await makeMember();
  await makeMembership(member, { startOffset: -40 });
  await checkIn(member, -8);

  const records = await buildOne(member);
  assert.equal(records.length, 1);
  assert.equal(records[0].attendanceStage, 'low_attendance');
  assert.ok(alertCodes(records[0]).includes('low_attendance'));

  await generateRetentionNotifications(NOW);
  await generateRetentionNotifications(NOW);
  const key = `attendance_7d:${member._id}:${records[0].lastAttendanceDayKey}`;
  const notices = await Notification.find({ 'data.retentionKey': key }).lean();
  assert.equal(notices.length, 1);
  assert.equal(notices[0].user.toString(), member._id.toString());
});

test('a member absent for more than 14 days is marked At Risk', async () => {
  const member = await makeMember();
  await makeMembership(member, { startOffset: -50 });
  await checkIn(member, -15);

  const records = await buildOne(member);
  const record = records[0];
  assert.equal(record.attendanceStage, 'at_risk');
  assert.equal(record.severity, 'critical');
  assert.ok(alertCodes(record).includes('at_risk'));
  assert.match(record.recommendedAction, /Contact/i);

  await generateRetentionNotifications(NOW);
  const key = `attendance_14d:${member._id}:${record.lastAttendanceDayKey}`;
  const notice = await notificationWithKey(key);
  assert.ok(notice);
});

test('recent attendance does not trigger an attendance alert', async () => {
  const member = await makeMember();
  await makeMembership(member, { startOffset: -40 });
  await checkIn(member, -2);

  const records = await buildOne(member);
  assert.equal(records.length, 0);
});

test('a new member is not flagged before completing 7 days', async () => {
  const member = await makeMember();
  await makeMembership(member, { startOffset: -5, endOffset: 60 });

  const records = await buildOne(member);
  assert.equal(records.length, 0);
});

test('a member with no attendance history is not treated as declining', async () => {
  const member = await makeMember();
  await makeMembership(member, { startOffset: -100 });

  const records = await buildOne(member);
  assert.equal(records.length, 1);
  assert.equal(records[0].attendanceDeclining, false);
  assert.ok(alertCodes(records[0]).includes('at_risk'));
});

test('a reliable drop in attendance is labelled Attendance Declining', async () => {
  const member = await makeMember();
  await makeMembership(member, { startOffset: -100 });
  for (const offset of [-50, -48, -46, -44, -42, -40]) await checkIn(member, offset);
  await checkIn(member, -20);
  await checkIn(member, -10);

  const records = await buildOne(member);
  const record = records[0];
  assert.equal(record.previousVisits, 6);
  assert.equal(record.recentVisits, 2);
  assert.equal(record.attendanceDeclining, true);
  assert.ok(alertCodes(record).includes('attendance_declining'));
});

test('insufficient previous history does not produce a declining-attendance alert', async () => {
  const member = await makeMember();
  await makeMembership(member, { startOffset: -100 });
  for (const offset of [-50, -45, -40]) await checkIn(member, offset);

  const records = await buildOne(member);
  assert.equal(records[0].attendanceDeclining, false);
});

test('future attendance is excluded from last-attendance calculations', async () => {
  const member = await makeMember();
  await makeMembership(member, { startOffset: -40 });
  await checkIn(member, 3);

  const records = await buildOne(member);
  assert.equal(records.length, 1);
  assert.equal(records[0].lastAttendanceAt, null);
  assert.ok(alertCodes(records[0]).includes('at_risk'));
});

test('only ACTIVE memberships are considered', async () => {
  const member = await makeMember();
  await makeMembership(member, { startOffset: -40, status: 'SUSPENDED' });

  const records = await buildOne(member);
  assert.equal(records.length, 0);
});

test('an active membership ending within 7 days is flagged as Membership Expiring', async () => {
  const member = await makeMember();
  await makeMembership(member, { startOffset: -20, endOffset: 5 });

  const records = await buildOne(member);
  assert.equal(records[0].daysUntilExpiry, 5);
  assert.ok(alertCodes(records[0]).includes('membership_expiring'));

  await generateRetentionNotifications(NOW);
  const membership = await Membership.findOne({ user: member._id, status: 'ACTIVE' }).lean();
  const key = `membership_expiry_7d:${membership._id}:${getGymDateKey(membership.endDate)}`;
  assert.ok(await notificationWithKey(key));
});

test('an active membership ending today gets an expiry-day reminder', async () => {
  const member = await makeMember();
  await makeMembership(member, { startOffset: -20, endOffset: 0 });

  const records = await buildOne(member);
  assert.equal(records[0].daysUntilExpiry, 0);

  await generateRetentionNotifications(NOW);
  const membership = await Membership.findOne({ user: member._id, status: 'ACTIVE' }).lean();
  const key = `membership_expiry_day:${membership._id}:${getGymDateKey(membership.endDate)}`;
  const notice = await notificationWithKey(key);
  assert.ok(notice);
  assert.match(notice.title, /Today/);
});

test('membership expiry reminders are deduplicated across repeated runs', async () => {
  const member = await makeMember();
  await makeMembership(member, { startOffset: -20, endOffset: 4 });

  await generateRetentionNotifications(NOW);
  await generateRetentionNotifications(NOW);
  const membership = await Membership.findOne({ user: member._id, status: 'ACTIVE' }).lean();
  const key = `membership_expiry_7d:${membership._id}:${getGymDateKey(membership.endDate)}`;
  const notices = await Notification.find({ 'data.retentionKey': key }).lean();
  assert.equal(notices.length, 1);
});

test('pending payments are visible to admins as Payment Pending', async () => {
  const member = await makeMember();
  await makeMembership(member, { startOffset: -40 });
  const payment = await addPayment(member, { amount: 1250, offset: -2 });

  const records = await buildOne(member);
  const record = records[0];
  assert.equal(record.pendingPayment, true);
  assert.equal(record.pendingPaymentCount, 1);
  assert.equal(record.pendingPaymentAmount, 1250);
  assert.ok(alertCodes(record).includes('payment_pending'));

  await generateRetentionNotifications(NOW);
  assert.ok(await notificationWithKey(`payment_due:${payment._id}`));
});

test('admin retention includes a pending payment even without an active membership', async () => {
  const member = await makeMember();
  const payment = await addPayment(member, { amount: 900, offset: -2 });

  const records = await buildRetentionMembers({ now: NOW });
  const record = records.find((row) => String(row.memberId) === String(member._id));
  assert.ok(record);
  assert.equal(record.membershipStatus, null);
  assert.equal(record.pendingPayment, true);
  assert.equal(record.pendingPaymentAmount, 900);
  assert.ok(alertCodes(record).includes('payment_pending'));
  assert.ok(!alertCodes(record).includes('progress_review'));

  await generateRetentionNotifications(NOW);
  assert.ok(await notificationWithKey(`payment_due:${payment._id}`));
});

test('completed payments are excluded from payment-pending alerts', async () => {
  const member = await makeMember();
  await makeMembership(member, { startOffset: -40 });
  await addPayment(member, { status: 'COMPLETED', offset: -2 });

  const records = await buildOne(member);
  assert.equal(records[0].pendingPayment, false);
  assert.ok(!alertCodes(records[0]).includes('payment_pending'));
});

test('pending-payment reminders are not repeated for the same payment', async () => {
  const member = await makeMember();
  await makeMembership(member, { startOffset: -40 });
  const payment = await addPayment(member, { offset: -3 });

  await generateRetentionNotifications(NOW);
  await generateRetentionNotifications(NOW);
  const notices = await Notification.find({ 'data.retentionKey': `payment_due:${payment._id}` }).lean();
  assert.equal(notices.length, 1);
});

test('a stale measurement notifies the member and the assigned trainer without health data', async () => {
  const trainer = await createTrainer();
  const member = await makeMember();
  await makeMembership(member, { startOffset: -80, trainerId: trainer._id });
  await measure(member, -40);

  const records = await buildOne(member, { includePayments: false });
  assert.equal(records[0].progressReviewNeeded, true);
  assert.ok(alertCodes(records[0]).includes('progress_review'));

  await generateRetentionNotifications(NOW);
  const measurementKey = getGymDateKey(dayDate(-40));
  const memberNotice = await notificationWithKey(`progress_review:${member._id}:${measurementKey}`);
  const trainerNotice = await notificationWithKey(`progress_review_trainer:${trainer._id}:${member._id}:${measurementKey}`);
  assert.ok(memberNotice);
  assert.ok(trainerNotice);
  assert.doesNotMatch(memberNotice.message, /weight|medical|injury|body fat/i);
  assert.doesNotMatch(trainerNotice.message, /weight|medical|injury|body fat/i);
});

test('a member with no measurement history is not flagged for progress review', async () => {
  const member = await makeMember();
  await makeMembership(member, { startOffset: -80 });

  const records = await buildOne(member, { includePayments: false });
  assert.equal(records[0].progressReviewNeeded, false);
  assert.ok(!alertCodes(records[0]).includes('progress_review'));
});

test('the admin at-risk API returns the dashboard fields and omits internal data', async () => {
  const { token } = await adminContext();
  const trainer = await createTrainer();
  const member = await makeMember('Route Member', REAL_NOW);
  await makeMembership(member, {
    startOffset: -40,
    endOffset: 5,
    trainerId: trainer._id,
    base: REAL_NOW
  });
  await addPayment(member, { offset: -2, base: REAL_NOW });
  await measure(member, -40, REAL_NOW);

  const res = await request('GET', '/api/retention/admin/at-risk', { token });
  assert.equal(res.status, 200);
  assert.ok(res.body.count >= 1);
  const record = (res.body.members || []).find((row) => String(row.memberId) === String(member._id));
  assert.ok(record);
  assert.equal(record.name, member.name);
  assert.equal(record.membershipStatus, 'ACTIVE');
  assert.equal(record.pendingPayment, true);
  assert.equal(record.progressReviewNeeded, true);
  assert.ok(record.lastAttendanceAt === null || record.lastAttendanceAt);
  assert.ok(record.membershipEndDate);
  assert.ok(Array.isArray(record.alerts));
  assert.ok(record.recommendedAction);
  assert.equal(record.trainerIds, undefined);
  assert.equal(record.memberships, undefined);
  assert.equal(record.pendingPayments, undefined);
});

test('trainer alerts are scoped to assigned and shared members and hide payments', async () => {
  const { token } = await adminContext();
  const trainer = await createTrainer();
  const otherTrainer = await createTrainer();
  const trainerToken = await login(trainer.email, 'Trainer@123');

  const assignedPlan = await makePlan({ trainerIncluded: true, trainerAllocationMode: 'ASSIGNED' });
  const sharedPlan = await makePlan({ trainerIncluded: true, trainerAllocationMode: 'SHARED' });

  const assigned = await makeMember('Assigned', REAL_NOW);
  await makeMembership(assigned, {
    plan: assignedPlan,
    startOffset: -40,
    trainerId: trainer._id,
    base: REAL_NOW
  });
  await addPayment(assigned, { offset: -2, base: REAL_NOW });

  const shared = await makeMember('Shared', REAL_NOW);
  await makeMembership(shared, {
    plan: sharedPlan,
    startOffset: -40,
    base: REAL_NOW
  });

  const outside = await makeMember('Outside', REAL_NOW);
  await makeMembership(outside, {
    plan: assignedPlan,
    startOffset: -40,
    trainerId: otherTrainer._id,
    base: REAL_NOW
  });

  const res = await request('GET', '/api/retention/trainer/alerts', { token: trainerToken });
  assert.equal(res.status, 200);
  const ids = (res.body.members || []).map((row) => String(row.memberId));
  assert.ok(ids.includes(String(assigned._id)));
  assert.ok(ids.includes(String(shared._id)));
  assert.ok(!ids.includes(String(outside._id)));
  const assignedRecord = res.body.members.find((row) => String(row.memberId) === String(assigned._id));
  assert.equal(assignedRecord.pendingPayment, undefined);
  assert.equal(assignedRecord.pendingPaymentAmount, undefined);
  assert.ok(!(assignedRecord.alerts || []).some((alert) => alert.code === 'payment_pending'));

  await request('GET', '/api/retention/admin/at-risk', { token });
});

test('invalid date inputs return safe empty values instead of throwing', () => {
  assert.equal(gymDayDiff('not-a-date', NOW), null);
  assert.equal(gymDayDiff(NOW, 'also-not-a-date'), null);
  assert.equal(shiftDayKey('not-a-date', 3), null);
});
