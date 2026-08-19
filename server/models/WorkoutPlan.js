const mongoose = require('mongoose');

const workoutPlanSchema = new mongoose.Schema({
  trainer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  member: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Plan name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  exercises: [{
    exercise: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exercise'
    },
    sets: { type: Number, default: 3 },
    reps: { type: Number, default: 10 },
    weight: { type: Number, default: 0 },
    duration: { type: Number, default: 0 },
    restTime: { type: Number, default: 60 },
    notes: { type: String, trim: true }
  }],
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  dayOfWeek: [{
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  }]
}, {
  timestamps: true
});

workoutPlanSchema.index({ member: 1 });
workoutPlanSchema.index({ trainer: 1 });

module.exports = mongoose.model('WorkoutPlan', workoutPlanSchema);
