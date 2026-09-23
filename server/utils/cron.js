const cron = require('node-cron');
const Membership = require('../models/Membership');
const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { bulkCreateNotifications } = require('./notify');
const { logAudit } = require('./audit');

const generateNotifications = async () => {
  try {
    console.log('[Cron] Running notification generation...');

    const now = new Date();
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringMemberships = await Membership.find({
      status: 'ACTIVE',
      endDate: { $lte: thirtyDaysFromNow, $gte: now }
    }).populate('user', 'name email').populate('plan', 'name');

    const notifiedLastDay = await Notification.find({
      user: { $in: expiringMemberships.map((m) => m.user?._id).filter(Boolean) },
      type: 'membership_expiry',
      createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
    }).select('user').lean();
    const alreadyNotified = new Set(notifiedLastDay.map((n) => String(n.user)));

    const expiryNotifications = expiringMemberships
      .filter((m) => m.user && !alreadyNotified.has(String(m.user._id)))
      .map((m) => ({
        user: m.user._id,
        title: 'Membership Expiring Soon',
        message: `Your ${m.plan?.name || ''} membership expires in ${Math.ceil((m.endDate - now) / (1000 * 60 * 60 * 24))} days.`,
        type: 'membership_expiry'
      }));

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const sevenDaysAgoNotif = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const members = await User.find({ role: 'member', isActive: true }).select('_id').lean();
    const attendedUserIds = await Attendance.distinct('user', { date: { $gte: sevenDaysAgo } });
    const attendedSet = new Set(attendedUserIds.map(String));
    const lowAttendanceMembers = members.filter((m) => !attendedSet.has(String(m._id)));

    const lowAttendanceNotified = await Notification.find({
      user: { $in: lowAttendanceMembers.map((m) => m._id) },
      type: 'low_attendance',
      createdAt: { $gte: sevenDaysAgoNotif }
    }).select('user').lean();
    const lowAlreadyNotified = new Set(lowAttendanceNotified.map((n) => String(n.user)));

    const lowNotifications = lowAttendanceMembers
      .filter((m) => !lowAlreadyNotified.has(String(m._id)))
      .map((m) => ({
        user: m._id,
        title: 'Low Attendance Alert',
        message: 'You haven\'t visited the gym in the last 7 days. Keep up your fitness routine!',
        type: 'low_attendance'
      }));

    if (expiryNotifications.length > 0) {
      await bulkCreateNotifications(expiryNotifications);
    }
    if (lowNotifications.length > 0) {
      await bulkCreateNotifications(lowNotifications);
    }

    console.log(`[Cron] Notification generation complete (${expiryNotifications.length} expiry, ${lowNotifications.length} low-attendance)`);
  } catch (error) {
    console.error('[Cron] Error:', error.message);
  }
};

const expireMemberships = async () => {
  try {
    const now = new Date();
    const expired = await Membership.find({ status: 'ACTIVE', endDate: { $lt: now } })
      .select('_id user endDate').lean();

    if (expired.length === 0) return;

    const ids = expired.map((m) => m._id);
    await Membership.updateMany({ _id: { $in: ids } }, { $set: { status: 'EXPIRED' } });
    await Promise.all(
      expired.map((m) => logAudit({
        action: 'expired',
        entity: 'Membership',
        entityId: m._id,
        user: m.user,
        reason: 'end date reached (daily expiry sweep)',
        metadata: { endDate: m.endDate }
      }))
    );

    const userIds = [...new Set(expired.map((m) => m.user).filter(Boolean))];
    const existing = await Notification.find({
      user: { $in: userIds },
      type: 'membership_expiry',
      title: 'Membership Expired',
      createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
    }).select('user').lean();
    const alreadyNotified = new Set(existing.map((n) => String(n.user)));

    const toCreate = expired
      .filter((m) => m.user && !alreadyNotified.has(String(m.user)))
      .map((m) => ({
        user: m.user,
        title: 'Membership Expired',
        message: 'Your membership has expired. Renew it to continue using the gym.',
        type: 'membership_expiry'
      }));

    await bulkCreateNotifications(toCreate);

    console.log(`[Cron] Expired ${ids.length} membership(s), ${toCreate.length} notification(s) sent`);
  } catch (error) {
    console.error('[Cron] Expiry error:', error.message);
  }
};

const scheduledJobs = [];

const startCronJobs = () => {
  scheduledJobs.push(
    cron.schedule('0 8 * * *', generateNotifications),
    cron.schedule('0 12 * * 1', generateNotifications),
    cron.schedule('15 0 * * *', expireMemberships)
  );
  console.log('[Cron] Scheduled notification + membership expiry jobs');
};

const stopCronJobs = () => {
  for (const job of scheduledJobs) {
    try { job.stop(); } catch (error) { /* already stopped */ }
  }
  scheduledJobs.length = 0;
};

module.exports = { startCronJobs, stopCronJobs, generateNotifications, expireMemberships };
