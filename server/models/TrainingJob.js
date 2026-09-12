const mongoose = require('mongoose');

const trainingJobSchema = new mongoose.Schema({
  jobType: {
    type: String,
    enum: ['scheduled', 'manual'],
    default: 'scheduled'
  },
  status: {
    type: String,
    enum: ['running', 'completed', 'failed'],
    default: 'running'
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  finishedAt: {
    type: Date
  },
  models: {
    type: [String],
    default: []
  },
  memberCount: {
    type: Number,
    default: 0
  },
  details: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

trainingJobSchema.index({ startedAt: -1 });

module.exports = mongoose.model('TrainingJob', trainingJobSchema);