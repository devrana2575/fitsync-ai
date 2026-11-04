'use strict';

const mongoose = require('mongoose');
const Membership = require('../models/Membership');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Payment = require('../models/Payment');
const BodyMeasurement = require('../models/BodyMeasurement');
const MemberProfile = require('../models/MemberProfile');
const Notification = require('../models/Notification');
const { bulkCreateNotifications } = require('./notify');
const {
  getGymDateKey,
  getGymDayStart,
  getGymDayStartOnDateKey
} = require('./gymTime');

const DAY_MS = 86400000;

const THRESHOLDS = Object.freeze({
  attendanceReminderDays: 7,
  attendanceAtRiskDays: 14,
  membershipExpiryDays: 7,
  paymentReminderHours: 24,
  progressReviewDays: 30,
  decliningWindowDays: 30,
  decliningMinPreviousVisits: 4,
  decliningMaxRecentRatio: 0.5
});

const ALERT_META = Object.freeze({
  at_risk: { label: 'At Risk', severity: 'critical' },
  attendance_declining: { label: 'Attendance Declining', severity: 'warning' },
  membership_expiring: { label: 'Membership Expiring', severity: 'warning' },
  payment_pending: { label: 'Payment Pending', severity: 'warning' },
  progress_review: { label: 'Progress Review Needed', severity: 'info' },
  low_attendance: { label: 'Low Attendance', severity: 'info' }
});

const RECOMMENDED_ACTION = Object.freeze({
  at_risk: 'Contact the member and review attendance barriers',
  attendance_declining: 'Check in about recent routine changes',
  membership_expiring: 'Confirm renewal and plan continuation',
  payment_pending: 'Follow up on the outstanding payment',
  progress_review: 'Schedule a progress review and measurement check-in',
  low_attendance: 'Send a friendly attendance reminder'
});

const safeDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dayKeyToUtcMs = (key) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ''))) return null;
  const [year, month, day] = String(key).split('-').map(Number);
  return Date.UTC(year, month - 1, day);
};

const shiftDayKey = (key, days) => {
  const ms = dayKeyToUtcMs(key);
  if (ms === null) return null;
  const date = new Date(ms + (Number(days) || 0) * DAY_MS);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
};

const gymDaysBetweenKeys = (fromKey, toKey) => {
  const from = dayKeyToUtcMs(fromKey);
  const to = dayKeyToUtcMs(toKey);
  if (from === null || to === null) return null;
  return Math.round((to - from) / DAY_MS);
};

const gymDayDiff = (fromDate, toDate) => {
  const from = safeDate(fromDate);
  const to = safeDate(toDate);
  if (!from || !to) return null;
  return gymDaysBetweenKeys(getGymDateKey(from), getGymDateKey(to));
};

const membershipStartOf = (membership) =>
  safeDate(membership.activatedAt) || safeDate(membership.startDate) || null;

const planNameOf = (membership) =>
  membership.plan?.name || membership.planSnapshot?.name || 'Membership';

const uniquePush = (list, value) => {
  if (!list.includes(value)) list.push(value);
};

const buildRecord = ({ member, memberships, lastAttendanceAt, attendanceDays, lastMeasurementAt, pendingPayments, profile, now, todayKey }) => {
  const memberId = String(member._id);
  const startedAt = memberships
    .map(membershipStartOf)
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime())[0] || null;
  const membershipStartKey = startedAt ? getGymDateKey(startedAt) : null;
  const tenureDays = startedAt ? gymDayDiff(startedAt, now) : null;

  const nearestMembership = [...memberships]
    .filter((membership) => safeDate(membership.endDate))
    .sort((a, b) => safeDate(a.endDate).getTime() - safeDate(b.endDate).getTime())[0] || null;
  const nearestEndDate = nearestMembership ? safeDate(nearestMembership.endDate) : null;
  const daysUntilExpiry = nearestEndDate ? gymDayDiff(now, nearestEndDate) : null;

  const lastDayKey = lastAttendanceAt ? getGymDateKey(lastAttendanceAt) : null;
  const daysSinceAttendance = lastAttendanceAt ? gymDayDiff(lastAttendanceAt, now) : null;
  const attendanceAnchorKey = lastDayKey && (!membershipStartKey || lastDayKey > membershipStartKey)
    ? lastDayKey
    : membershipStartKey;
  const attendanceElapsedDays = attendanceAnchorKey
    ? gymDaysBetweenKeys(attendanceAnchorKey, todayKey)
    : null;

  let attendanceStage = null;
  if (tenureDays !== null
    && tenureDays >= THRESHOLDS.attendanceReminderDays
    && attendanceElapsedDays !== null) {
    if (attendanceElapsedDays >= THRESHOLDS.attendanceAtRiskDays) attendanceStage = 'at_risk';
    else if (attendanceElapsedDays >= THRESHOLDS.attendanceReminderDays) attendanceStage = 'low_attendance';
  }

  const recentStartKey = shiftDayKey(todayKey, -(THRESHOLDS.decliningWindowDays - 1));
  const previousStartKey = shiftDayKey(todayKey, -(THRESHOLDS.decliningWindowDays * 2 - 1));
  let recentVisits = 0;
  let previousVisits = 0;
  for (const key of attendanceDays) {
    if (key >= recentStartKey && key <= todayKey) recentVisits += 1;
    else if (key >= previousStartKey && key < recentStartKey) previousVisits += 1;
  }
  const attendanceDeclining = tenureDays !== null
    && tenureDays >= THRESHOLDS.decliningWindowDays * 2
    && previousVisits >= THRESHOLDS.decliningMinPreviousVisits
    && recentVisits <= Math.floor(previousVisits * THRESHOLDS.decliningMaxRecentRatio);

  const expiringMembership = memberships
    .map((membership) => {
      const endDate = safeDate(membership.endDate);
      return { membership, endDate, daysUntilExpiry: endDate ? gymDayDiff(now, endDate) : null };
    })
    .filter((entry) => entry.daysUntilExpiry !== null
      && entry.daysUntilExpiry >= 0
      && entry.daysUntilExpiry <= THRESHOLDS.membershipExpiryDays)
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)[0] || null;

  const daysSinceMeasurement = lastMeasurementAt ? gymDayDiff(lastMeasurementAt, now) : null;
  const progressReviewNeeded = Boolean(memberships.length > 0
    && lastMeasurementAt
    && daysSinceMeasurement !== null
    && daysSinceMeasurement >= THRESHOLDS.progressReviewDays);

  const pendingPaymentAmount = pendingPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const paymentReminderDue = pendingPayments.some((payment) => {
    const paymentDate = safeDate(payment.date) || safeDate(payment.createdAt);
    return Boolean(paymentDate
      && now.getTime() - paymentDate.getTime() >= THRESHOLDS.paymentReminderHours * 60 * 60 * 1000);
  });

  const alerts = [];
  const addAlert = (code) => {
    const meta = ALERT_META[code];
    if (meta && !alerts.some((alert) => alert.code === code)) {
      alerts.push({ code, label: meta.label, severity: meta.severity });
    }
  };

  if (attendanceStage === 'at_risk') addAlert('at_risk');
  if (attendanceDeclining) addAlert('attendance_declining');
  if (expiringMembership) addAlert('membership_expiring');
  if (pendingPayments.length > 0) addAlert('payment_pending');
  if (progressReviewNeeded) addAlert('progress_review');
  if (attendanceStage === 'low_attendance') addAlert('low_attendance');

  const trainerIds = new Set();
  for (const membership of memberships) {
    const assignment = membership.trainerAssignment;
    if (assignment && assignment.assignmentInitialized && assignment.status === 'ASSIGNED' && assignment.currentTrainer) {
      trainerIds.add(String(assignment.currentTrainer));
    }
  }
  if (profile?.assignedTrainer) trainerIds.add(String(profile.assignedTrainer));

  const primaryAlert = alerts[0] || null;

  return {
    memberId,
    name: member.name || 'Member',
    email: member.email || '',
    avatar: member.avatar || '',
    membershipId: nearestMembership ? String(nearestMembership._id) : null,
    membershipStatus: nearestMembership ? nearestMembership.status : null,
    membershipPlan: nearestMembership ? planNameOf(nearestMembership) : '',
    membershipStartDate: startedAt,
    membershipEndDate: nearestEndDate,
    daysUntilExpiry,
    lastAttendanceAt,
    lastAttendanceDayKey: lastDayKey,
    daysSinceAttendance,
    attendanceAgeDays: attendanceElapsedDays,
    attendanceStage,
    attendanceDeclining,
    recentVisits,
    previousVisits,
    pendingPayment: pendingPayments.length > 0,
    pendingPaymentCount: pendingPayments.length,
    pendingPaymentAmount,
    paymentReminderDue,
    lastMeasurementAt,
    daysSinceMeasurement,
    progressReviewNeeded,
    alerts,
    reasons: alerts.map((alert) => alert.label),
    recommendedAction: primaryAlert ? RECOMMENDED_ACTION[primaryAlert.code] || '' : '',
    atRisk: alerts.length > 0,
    severity: primaryAlert ? primaryAlert.severity : 'none',
    trainerIds: [...trainerIds],
    memberships,
    pendingPayments,
    attendanceAnchorKey
  };
};

const buildRetentionMembers = async ({ now = new Date(), memberIds = null, includePayments = true } = {}) => {
  const todayKey = getGymDateKey(now);
  const membershipFilter = {
    status: 'ACTIVE',
    endDate: { $gte: getGymDayStart(now) }
  };

  if (memberIds) {
    const ids = memberIds.map(String).filter(Boolean);
    if (ids.length === 0) return [];
    membershipFilter.user = { $in: ids };
  }

  const includePaymentOnlyMembers = includePayments && !memberIds;
  const [membershipRows, allPendingPayments] = await Promise.all([
    Membership.find(membershipFilter)
      .populate('user', 'name email avatar role isActive')
      .populate('plan', 'name')
      .lean(),
    includePaymentOnlyMembers
      ? Payment.find({ status: 'PENDING' })
          .select('user amount date createdAt')
          .sort({ date: 1 })
          .lean()
      : Promise.resolve(null)
  ]);

  const byMember = new Map();
  for (const membership of membershipRows) {
    const user = membership.user;
    if (!user || !user._id || user.role !== 'member' || user.isActive === false) continue;
    const id = String(user._id);
    if (!byMember.has(id)) byMember.set(id, { member: user, memberships: [] });
    byMember.get(id).memberships.push(membership);
  }

  if (allPendingPayments) {
    const paymentOnlyIds = [...new Set(allPendingPayments
      .map((payment) => String(payment.user || ''))
      .filter((id) => id && !byMember.has(id)))];
    if (paymentOnlyIds.length > 0) {
      const paymentUsers = await User.find({
        _id: { $in: paymentOnlyIds },
        role: 'member',
        isActive: { $ne: false }
      }).select('name email avatar role isActive').lean();
      for (const user of paymentUsers) {
        byMember.set(String(user._id), { member: user, memberships: [] });
      }
    }
  }

  if (byMember.size === 0) return [];

  const userIds = [...byMember.keys()];
  const userObjectIds = userIds.map((id) => new mongoose.Types.ObjectId(id));
  const windowStartKey = shiftDayKey(todayKey, -(THRESHOLDS.decliningWindowDays * 2 - 1));
  const windowStart = getGymDayStartOnDateKey(windowStartKey);
  const attendanceMatch = { user: { $in: userObjectIds }, date: { $lte: now } };

  const [lastAttendanceRows, attendanceRows, measurementRows, profileRows, paymentRows] = await Promise.all([
    Attendance.aggregate([
      { $match: attendanceMatch },
      { $sort: { date: -1, checkInTime: -1 } },
      { $group: { _id: '$user', lastDate: { $first: '$date' }, lastCheckIn: { $first: '$checkInTime' } } }
    ]),
    Attendance.find({ user: { $in: userObjectIds }, date: { $gte: windowStart, $lte: now } })
      .select('user date dayKey')
      .lean(),
    BodyMeasurement.aggregate([
      { $match: { user: { $in: userObjectIds }, date: { $lte: now } } },
      { $sort: { date: -1 } },
      { $group: { _id: '$user', lastDate: { $first: '$date' } } }
    ]),
    MemberProfile.find({ user: { $in: userObjectIds } }).select('user assignedTrainer').lean(),
    allPendingPayments
      ? Promise.resolve(allPendingPayments)
      : includePayments
        ? Payment.find({ user: { $in: userObjectIds }, status: 'PENDING' })
            .select('user amount date createdAt')
            .sort({ date: 1 })
            .lean()
        : Promise.resolve([])
  ]);

  const lastAttendanceByUser = new Map();
  for (const row of lastAttendanceRows) {
    const lastAt = safeDate(row.lastCheckIn) || safeDate(row.lastDate);
    if (lastAt) lastAttendanceByUser.set(String(row._id), lastAt);
  }

  const attendanceDaysByUser = new Map();
  for (const row of attendanceRows) {
    const date = safeDate(row.date);
    if (!date) continue;
    const key = /^\d{4}-\d{2}-\d{2}$/.test(String(row.dayKey || '')) ? row.dayKey : getGymDateKey(date);
    if (!key || key > todayKey) continue;
    const id = String(row.user);
    if (!attendanceDaysByUser.has(id)) attendanceDaysByUser.set(id, new Set());
    attendanceDaysByUser.get(id).add(key);
  }

  const measurementByUser = new Map();
  for (const row of measurementRows) {
    const date = safeDate(row.lastDate);
    if (date) measurementByUser.set(String(row._id), date);
  }

  const profileByUser = new Map(profileRows.map((profile) => [String(profile.user), profile]));

  const paymentsByUser = new Map();
  for (const payment of paymentRows) {
    const id = String(payment.user);
    if (!paymentsByUser.has(id)) paymentsByUser.set(id, []);
    paymentsByUser.get(id).push(payment);
  }

  const records = [];
  for (const [memberId, entry] of byMember.entries()) {
    records.push(buildRecord({
      member: entry.member,
      memberships: entry.memberships,
      lastAttendanceAt: lastAttendanceByUser.get(memberId) || null,
      attendanceDays: attendanceDaysByUser.get(memberId) || new Set(),
      lastMeasurementAt: measurementByUser.get(memberId) || null,
      pendingPayments: paymentsByUser.get(memberId) || [],
      profile: profileByUser.get(memberId) || null,
      now,
      todayKey
    }));
  }

  const severityRank = { critical: 0, warning: 1, info: 2, none: 3 };
  return records
    .filter((record) => record.atRisk)
    .sort((a, b) => {
      const bySeverity = severityRank[a.severity] - severityRank[b.severity];
      if (bySeverity !== 0) return bySeverity;
      const aDays = a.attendanceAgeDays ?? -1;
      const bDays = b.attendanceAgeDays ?? -1;
      if (bDays !== aDays) return bDays - aDays;
      return a.name.localeCompare(b.name);
    });
};

const publicRetentionMember = (member, { includePayments = true } = {}) => {
  const {
    trainerIds,
    memberships,
    pendingPayments,
    attendanceAnchorKey,
    ...publicMember
  } = member;
  if (!includePayments) {
    delete publicMember.pendingPayment;
    delete publicMember.pendingPaymentCount;
    delete publicMember.pendingPaymentAmount;
    delete publicMember.paymentReminderDue;
  }
  return publicMember;
};

const buildRetentionNotificationCandidates = (members, now) => {
  const candidates = [];
  const pendingKeys = new Set();
  const push = (notification) => {
    const key = notification?.data?.retentionKey;
    if (!key || pendingKeys.has(key)) return;
    pendingKeys.add(key);
    candidates.push(notification);
  };

  for (const member of members) {
    const memberId = member.memberId;

    if (member.attendanceStage && member.attendanceAnchorKey) {
      const atRisk = member.attendanceStage === 'at_risk';
      push({
        user: member.memberId,
        title: atRisk ? 'We Miss You at the Gym' : 'Attendance Reminder',
        message: atRisk
          ? 'We have not seen you at the gym in over 14 days. Speak with your trainer so we can help you get back on track.'
          : 'We have not seen you at the gym in over 7 days. A quick session this week can help you stay on track.',
        type: 'low_attendance',
        link: '/member/attendance',
        data: {
          retentionKey: `${atRisk ? 'attendance_14d' : 'attendance_7d'}:${memberId}:${member.attendanceAnchorKey}`,
          memberId,
          severity: atRisk ? 'critical' : 'info'
        }
      });
    }

    if (member.attendanceDeclining) {
      const periodKey = getGymDateKey(now).slice(0, 7);
      push({
        user: member.memberId,
        title: 'Attendance Trend Update',
        message: 'Your gym visits have declined recently. Let us know how we can support your routine.',
        type: 'low_attendance',
        link: '/member/attendance',
        data: {
          retentionKey: `attendance_declining:${memberId}:${periodKey}`,
          memberId,
          severity: 'warning'
        }
      });
    }

    for (const membership of member.memberships) {
      const endDate = safeDate(membership.endDate);
      if (!endDate) continue;
      const daysUntil = gymDayDiff(now, endDate);
      if (daysUntil === null || daysUntil < 0 || daysUntil > THRESHOLDS.membershipExpiryDays) continue;
      const endDateKey = getGymDateKey(endDate);
      const expiryDay = daysUntil === 0;
      push({
        user: member.memberId,
        title: expiryDay ? 'Membership Expires Today' : 'Membership Expiring Soon',
        message: expiryDay
          ? `Your ${planNameOf(membership)} membership expires today. Renew to keep your access.`
          : `Your ${planNameOf(membership)} membership expires in ${daysUntil} day${daysUntil === 1 ? '' : 's'}. Renew to keep your access.`,
        type: 'membership_expiry',
        link: '/member/membership',
        data: {
          retentionKey: `${expiryDay ? 'membership_expiry_day' : 'membership_expiry_7d'}:${membership._id}:${endDateKey}`,
          memberId,
          membershipId: String(membership._id),
          severity: expiryDay ? 'critical' : 'warning'
        }
      });
    }

    if (member.paymentReminderDue) {
      for (const payment of member.pendingPayments) {
        const paymentDate = safeDate(payment.date) || safeDate(payment.createdAt);
        if (!paymentDate) continue;
        if (now.getTime() - paymentDate.getTime() < THRESHOLDS.paymentReminderHours * 60 * 60 * 1000) continue;
        push({
          user: member.memberId,
          title: 'Payment Pending',
          message: `Your payment of Rs. ${Number(payment.amount || 0).toLocaleString('en-IN')} is still pending. Complete it or contact the gym if you need help.`,
          type: 'payment_due',
          link: '/member/payments',
          data: {
            retentionKey: `payment_due:${payment._id}`,
            memberId,
            paymentId: String(payment._id),
            severity: 'warning'
          }
        });
      }
    }

    if (member.progressReviewNeeded && member.lastMeasurementAt) {
      const measurementKey = getGymDateKey(member.lastMeasurementAt);
      push({
        user: member.memberId,
        title: 'Progress Review Due',
        message: 'It has been over 30 days since your last measurement. Book a progress review with your trainer.',
        type: 'progress_anomaly',
        link: '/member/progress',
        data: {
          retentionKey: `progress_review:${memberId}:${measurementKey}`,
          memberId,
          severity: 'info'
        }
      });

      for (const trainerId of member.trainerIds) {
        push({
          user: trainerId,
          title: 'Member Progress Review Due',
          message: `${member.name}'s progress review is due. It has been over 30 days since their last measurement.`,
          type: 'progress_anomaly',
          link: `/trainer/members/${memberId}`,
          data: {
            retentionKey: `progress_review_trainer:${trainerId}:${memberId}:${measurementKey}`,
            memberId,
            severity: 'info'
          }
        });
      }
    }
  }

  return candidates;
};

const generateRetentionNotifications = async (now = new Date()) => {
  const members = await buildRetentionMembers({ now, includePayments: true });
  const candidates = buildRetentionNotificationCandidates(members, now);
  if (candidates.length === 0) {
    return { members: members.length, candidates: 0, created: 0, skipped: 0 };
  }

  const keys = [...new Set(candidates.map((notification) => notification.data.retentionKey))];
  const existing = await Notification.find({ 'data.retentionKey': { $in: keys } })
    .select('data.retentionKey')
    .lean();
  const existingKeys = new Set(
    existing
      .map((notification) => notification.data && notification.data.retentionKey)
      .filter(Boolean)
  );

  const toCreate = candidates.filter((notification) => !existingKeys.has(notification.data.retentionKey));
  if (toCreate.length > 0) await bulkCreateNotifications(toCreate);

  return {
    members: members.length,
    candidates: candidates.length,
    created: toCreate.length,
    skipped: candidates.length - toCreate.length
  };
};

module.exports = {
  THRESHOLDS,
  ALERT_META,
  gymDayDiff,
  shiftDayKey,
  buildRetentionMembers,
  publicRetentionMember,
  buildRetentionNotificationCandidates,
  generateRetentionNotifications
};
