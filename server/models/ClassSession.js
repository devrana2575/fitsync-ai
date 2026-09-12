const mongoose = require('mongoose');

const classSessionSchema = new mongoose.Schema({
  gymClass: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GymClass',
    required: [true, 'Class reference is required']
  },
  trainer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Trainer is required']
  },
  startsAt: {
    type: Date,
    required: [true, 'Start time is required']
  },
  duration: {
    type: Number,
    min: 10,
    max: 240,
    default: 45
  },
  location: {
    type: String,
    trim: true,
    default: 'Main Studio'
  },
  capacity: {
    type: Number,
    min: 1,
    max: 500,
    default: 15
  },
  waitlistLimit: {
    type: Number,
    min: 0,
    max: 100,
    default: 5
  },
  status: {
    type: String,
    enum: ['scheduled', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

classSessionSchema.index({ startsAt: 1, status: 1 });
classSessionSchema.index({ gymClass: 1, startsAt: 1 });
classSessionSchema.index({ trainer: 1, startsAt: 1 });

module.exports = mongoose.model('ClassSession', classSessionSchema);