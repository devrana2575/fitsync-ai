const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['membership_expiry', 'payment_due', 'low_attendance', 'high_risk', 'progress_anomaly', 'equipment_maintenance', 'trainer_absent', 'trainer_assignment', 'payment', 'general', 'workout_reminder', 'class_update', 'announcement', 'system'],
    default: 'general'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  link: {
    type: String,
    trim: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

notificationSchema.index({ user: 1, isRead: 1 });
notificationSchema.index({ user: 1, createdAt: -1 });

notificationSchema.post('save', function (doc) {
  try {
    const { emitToUser } = require('../utils/socket');
    const userId = doc.user && typeof doc.user === 'object' && doc.user._id ? doc.user._id : doc.user;
    emitToUser(String(userId), 'notification', doc.toObject());
  } catch (error) {
    // socket layer not initialized yet — ignore
  }
  setImmediate(async () => {
    try {
      const User = require('./User');
      const MemberProfile = require('./MemberProfile');
      const TrainerProfile = require('./TrainerProfile');
      const { dispatchMessage } = require('../utils/messaging');
      const userId = doc.user && typeof doc.user === 'object' && doc.user._id ? doc.user._id : doc.user;
      if (!userId) return;
      const user = await User.findById(userId).select('email preferences role');
      if (!user) return;
      const profile = user.role === 'trainer'
        ? await TrainerProfile.findOne({ user: userId }).select('phone')
        : await MemberProfile.findOne({ user: userId }).select('phone');
      user.phone = profile?.phone || '';
      dispatchMessage(user, doc.toObject());
    } catch (error) {
      // best-effort messaging — ignore failures
    }
  });
});

module.exports = mongoose.model('Notification', notificationSchema);
