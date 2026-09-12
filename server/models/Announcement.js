const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: 120
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  priority: {
    type: String,
    enum: ['info', 'warning', 'critical'],
    default: 'info'
  },
  pinned: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

announcementSchema.index({ isActive: 1, pinned: -1, createdAt: -1 });
announcementSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('Announcement', announcementSchema);