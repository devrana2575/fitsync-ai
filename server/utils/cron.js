const cron = require('node-cron');
const Membership = require('../models/Membership');
const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const AIInsight = require('../models/AIInsight');
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

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    for (const member of members) {
      const monthAttendance = await Attendance.countDocuments({
        user: member._id,
        date: { $gte: thirtyDaysAgo }
      });
      const attendancePct = (monthAttendance / 30) * 100;

      if (attendancePct < 20) {
        await AIInsight.findOneAndUpdate(
          { user: member._id, type: 'engagement', title: 'Low Monthly Attendance' },
          {
            user: member._id,
            type: 'engagement',
            title: 'Low Monthly Attendance',
            description: `Your attendance has been ${attendancePct.toFixed(0)}% this month (${monthAttendance} visits in 30 days). Regular attendance helps achieve fitness goals.`,
            severity: 'warning'
          },
          { upsert: true, new: true }
        );
      }

      const lastAtt = await Attendance.findOne({ user: member._id }).sort({ date: -1 });
      if (lastAtt) {
        const daysSince = Math.floor((now - lastAtt.date) / (1000 * 60 * 60 * 24));
        if (daysSince > 14) {
          await AIInsight.findOneAndUpdate(
            { user: member._id, type: 'engagement', title: 'Extended Absence' },
            {
              user: member._id,
              type: 'engagement',
              title: 'Extended Absence',
              description: `You have not visited the gym for ${daysSince} days. Consider resuming your workout routine.`,
              severity: 'critical'
            },
            { upsert: true, new: true }
          );
        }
      }
    }

    console.log('[Cron] Notification generation complete');
  } catch (error) {
    console.error('[Cron] Error:', error.message);
  }
};

const startCronJobs = () => {
  cron.schedule('0 8 * * *', generateNotifications);
  cron.schedule('0 12 * * 1', generateNotifications);
  console.log('[Cron] Scheduled notification jobs');
};

module.exports = { startCronJobs, generateNotifications };
