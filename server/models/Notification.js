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
    enum: ['membership_expiry', 'payment_due', 'low_attendance', 'high_risk', 'progress_anomaly', 'equipment_maintenance', 'general', 'workout_reminder', 'class_update', 'announcement'],
    default: 'general'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  link: {
    type: String,
    trim: true
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
});

module.exports = mongoose.model('Notification', notificationSchema);
