const Notification = require('../models/Notification');
const User = require('../models/User');
const MemberProfile = require('../models/MemberProfile');
const TrainerProfile = require('../models/TrainerProfile');
const { emitToUser } = require('./socket');
const { dispatchMessage } = require('./messaging');

const userIdOf = (doc) => {
  const user = doc.user;
  return user && typeof user === 'object' && user._id ? user._id : user;
};

const bulkCreateNotifications = async (notifications) => {
  if (!notifications || notifications.length === 0) return [];
  const docs = await Notification.insertMany(notifications, { ordered: false });

  for (const doc of docs) {
    emitToUser(String(userIdOf(doc)), 'notification', doc.toObject());
  }

  setImmediate(async () => {
    try {
      const ids = [...new Set(docs.map((d) => String(userIdOf(d))).filter(Boolean))];
      if (ids.length === 0) return;
      const users = await User.find({ _id: { $in: ids } }).select('email preferences role').lean();
      if (users.length === 0) return;

      const memberIds = users.filter((u) => u.role !== 'trainer').map((u) => u._id);
      const trainerIds = users.filter((u) => u.role === 'trainer').map((u) => u._id);
      const [memberProfiles, trainerProfiles] = await Promise.all([
        memberIds.length ? MemberProfile.find({ user: { $in: memberIds } }).select('user phone').lean() : [],
        trainerIds.length ? TrainerProfile.find({ user: { $in: trainerIds } }).select('user phone').lean() : []
      ]);

      const phoneByUser = new Map();
      for (const p of memberProfiles) phoneByUser.set(String(p.user), p.phone || '');
      for (const p of trainerProfiles) phoneByUser.set(String(p.user), p.phone || '');

      const userById = new Map(users.map((u) => [String(u._id), u]));
      for (const doc of docs) {
        const user = userById.get(String(userIdOf(doc)));
        if (!user) continue;
        dispatchMessage({ ...user, phone: phoneByUser.get(String(user._id)) || '' }, doc.toObject());
      }
    } catch (error) {
      // best-effort messaging — ignore failures
    }
  });

  return docs;
};

module.exports = { bulkCreateNotifications };