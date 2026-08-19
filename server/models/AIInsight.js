const mongoose = require('mongoose');

const aiInsightSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  type: {
    type: String,
    required: true,
    enum: ['attendance', 'workout', 'progress', 'membership', 'engagement', 'general']
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  severity: {
    type: String,
    enum: ['info', 'warning', 'critical'],
    default: 'info'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

aiInsightSchema.index({ user: 1, type: 1 });
aiInsightSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AIInsight', aiInsightSchema);
