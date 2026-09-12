const mongoose = require('mongoose');

const workoutTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Template name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  goal: {
    type: String,
    enum: ['strength', 'hypertrophy', 'endurance', 'weight_loss', 'general_fitness'],
    default: 'general_fitness'
  },
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'intermediate'
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
  dayOfWeek: [{
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  }],
  timesAssigned: {
    type: Number,
    default: 0
  },
  isShared: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

workoutTemplateSchema.index({ createdBy: 1, isActive: 1 });
workoutTemplateSchema.index({ goal: 1, difficulty: 1, isActive: 1 });

module.exports = mongoose.model('WorkoutTemplate', workoutTemplateSchema);