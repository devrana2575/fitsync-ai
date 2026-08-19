const mongoose = require('mongoose');

const workoutLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  workoutPlan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkoutPlan'
  },
  exercise: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exercise',
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  sets: { type: Number, required: true },
  reps: { type: Number, required: true },
  weight: { type: Number, default: 0 },
  duration: { type: Number, default: 0 },
  isCompleted: {
    type: Boolean,
    default: true
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

workoutLogSchema.index({ user: 1, date: -1 });
workoutLogSchema.index({ user: 1, exercise: 1 });

module.exports = mongoose.model('WorkoutLog', workoutLogSchema);
