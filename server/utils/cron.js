const cron = require('node-cron');
const Membership = require('../models/Membership');
const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const User = require('../models/User');

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

    for (const m of expiringMemberships) {
      if (!m.user) continue;
      const daysLeft = Math.ceil((m.endDate - now) / (1000 * 60 * 60 * 24));
      const existing = await Notification.findOne({
        user: m.user._id,
        type: 'membership_expiry',
        createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
      });
      if (!existing) {
        await Notification.create({
          user: m.user._id,
          title: 'Membership Expiring Soon',
          message: `Your ${m.plan?.name || ''} membership expires in ${daysLeft} days.`,
          type: 'membership_expiry'
        });
      }
    }

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const members = await User.find({ role: 'member', isActive: true });
    for (const member of members) {
      const recentAttendance = await Attendance.countDocuments({
        user: member._id,
        date: { $gte: sevenDaysAgo }
      });
      if (recentAttendance === 0) {
        const existing = await Notification.findOne({
          user: member._id,
          type: 'low_attendance',
          createdAt: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }
        });
        if (!existing) {
          await Notification.create({
            user: member._id,
            title: 'Low Attendance Alert',
            message: 'You haven\'t visited the gym in the last 7 days. Keep up your fitness routine!',
            type: 'low_attendance'
          });
        }
      }
    }

    console.log('[Cron] Notification generation complete');
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

    let notified = 0;
    for (const m of expired) {
      if (!m.user) continue;
      const existing = await Notification.findOne({
        user: m.user._id,
        type: 'membership_expiry',
        title: 'Membership Expired',
        createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
      });
      if (!existing) {
        await Notification.create({
          user: m.user._id,
          title: 'Membership Expired',
          message: 'Your membership has expired. Renew it to continue using the gym.',
          type: 'membership_expiry'
        });
        notified += 1;
      }
    }

    console.log(`[Cron] Expired ${ids.length} membership(s), ${notified} notification(s) sent`);
  } catch (error) {
    console.error('[Cron] Expiry error:', error.message);
  }
};

const startCronJobs = () => {
  cron.schedule('0 8 * * *', generateNotifications);
  cron.schedule('0 12 * * 1', generateNotifications);
  cron.schedule('15 0 * * *', expireMemberships);
  console.log('[Cron] Scheduled notification + membership expiry jobs');
};

module.exports = { startCronJobs, generateNotifications, expireMemberships };
