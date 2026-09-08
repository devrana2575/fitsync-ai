const mongoose = require('mongoose');

const fitnessGoalSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['weight_loss', 'muscle_gain', 'strength', 'endurance', 'flexibility', 'general_fitness']
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  start: {
    type: Number
  },
  target: {
    type: Number,
    required: true
  },
  current: {
    type: Number,
    default: 0
  },
  unit: {
    type: String,
    default: 'kg'
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  targetDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'COMPLETED', 'FAILED', 'PAUSED'],
    default: 'ACTIVE'
  }
}, {
  timestamps: true
});

fitnessGoalSchema.index({ user: 1 });
fitnessGoalSchema.index({ status: 1 });

module.exports = mongoose.model('FitnessGoal', fitnessGoalSchema);
