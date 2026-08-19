const mongoose = require('mongoose');

const mlPredictionSchema = new mongoose.Schema({
  member: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  model: {
    type: String,
    required: true,
    enum: ['segmentation', 'engagement_risk', 'progress_anomaly', 'attendance_forecast']
  },
  prediction: {
    type: String,
    required: true
  },
  probability: {
    type: Number,
    min: 0,
    max: 1
  },
  riskLevel: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH']
  },
  features: {
    type: mongoose.Schema.Types.Mixed
  },
  reason: {
    type: String,
    trim: true
  },
  predictedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

mlPredictionSchema.index({ member: 1, model: 1 });
mlPredictionSchema.index({ predictedAt: -1 });

module.exports = mongoose.model('MLPrediction', mlPredictionSchema);
