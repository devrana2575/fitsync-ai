const cron = require('node-cron');
const Membership = require('../models/Membership');
const Notification = require('../models/Notification');
const { bulkCreateNotifications } = require('./notify');
const { logAudit } = require('./audit');
const { getGymTimezone, gymWallTimeToUtc, setGymTimezone } = require('./gymTime');
const { reconcileSickLeaves } = require('./sickLeaveCoverage');
const { generateRetentionNotifications } = require('./retention');

// Translate the intended gym-local trigger wall-clocks to UTC cron
// expressions so the host's wall clock never matters. Returns one entry per
// scheduled job; the returned timezone is always Etc/UTC because the UTC
// wall-clock expression is what node-cron must run against.
const buildCronExpressions = (gymTimezone) => {
  setGymTimezone(gymTimezone);
  const pad = (n) => String(n).padStart(2, '0');
  const daily = gymWallTimeToUtc(8, 0); // generateNotifications daily 08:00 gym time
  const monday = gymWallTimeToUtc(12, 0); // generateNotifications Monday 12:00 gym time
  const expiry = gymWallTimeToUtc(0, 15); // expireMemberships daily 00:15 gym time
  const sickLeave = gymWallTimeToUtc(0, 30); // reconcileSickLeaves daily 00:30 gym time
  return [
    { expression: `${pad(daily.minute)} ${pad(daily.hour)} * * *`, timezone: 'Etc/UTC', target: 'generateNotifications_daily' },
    { expression: `${pad(monday.minute)} ${pad(monday.hour)} * * 1`, timezone: 'Etc/UTC', target: 'generateNotifications_monday' },
    { expression: `${pad(expiry.minute)} ${pad(expiry.hour)} * * *`, timezone: 'Etc/UTC', target: 'expireMemberships_daily' },
    { expression: `${pad(sickLeave.minute)} ${pad(sickLeave.hour)} * * *`, timezone: 'Etc/UTC', target: 'reconcileSickLeaves_daily' }
  ];
};

const generateNotifications = async (now = new Date()) => {
  try {
    console.log('[Cron] Running retention notification generation...');
    const result = await generateRetentionNotifications(now);
    console.log(`[Cron] Retention notifications complete (${result.created} created, ${result.skipped} deduplicated, ${result.members} at-risk members)`);
    return result;
  } catch (error) {
    console.error('[Cron] Error:', error.message);
    return null;
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

// target -> handler, resolved by `target` (not array position) so adding a
// job can never silently bind a handler to the wrong expression.
const CRON_HANDLERS = {
  generateNotifications_daily: generateNotifications,
  generateNotifications_monday: generateNotifications,
  expireMemberships_daily: expireMemberships,
  reconcileSickLeaves_daily: () => reconcileSickLeaves()
};

const startCronJobs = () => {
  const expressions = buildCronExpressions(getGymTimezone());
  expressions.forEach((job) => {
    const handler = CRON_HANDLERS[job.target];
    if (!handler) {
      console.error(`[Cron] No handler registered for target "${job.target}" - job skipped`);
      return;
    }
    scheduledJobs.push(cron.schedule(job.expression, handler, { timezone: job.timezone }));
  });
  console.log(`[Cron] Scheduled ${expressions.length} job(s) (notification + expiry + sick-leave reconcile, Etc/UTC)`);
};

const stopCronJobs = () => {
  for (const job of scheduledJobs) {
    try { job.stop(); } catch (error) { /* already stopped */ }
  }
  scheduledJobs.length = 0;
};

// Re-register every scheduled job. Safe to call repeatedly: any previously
// registered jobs are stopped first (idempotent). Invoked by the settings
// route after a runtime gym-timezone change.
const rescheduleCronJobs = () => {
  stopCronJobs();
  startCronJobs();
};

module.exports = {
  startCronJobs,
  stopCronJobs,
  rescheduleCronJobs,
  generateNotifications,
  expireMemberships,
  reconcileSickLeaves,
  buildCronExpressions
};
