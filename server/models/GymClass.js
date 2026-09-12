const mongoose = require('mongoose');

const gymClassSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Class name is required'],
    trim: true,
    unique: true
  },
  category: {
    type: String,
    enum: ['strength', 'cardio', 'yoga', 'hiit', 'crossfit', 'dance', 'core', 'flexibility', 'boxing', 'group_fitness', 'other'],
    default: 'group_fitness'
  },
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'all_levels'],
    default: 'all_levels'
  },
  description: {
    type: String,
    trim: true
  },
  defaultDuration: {
    type: Number,
    min: 10,
    max: 180,
    default: 45
  },
  defaultCapacity: {
    type: Number,
    min: 1,
    max: 500,
    default: 15
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

gymClassSchema.index({ name: 1, isActive: 1 });

module.exports = mongoose.model('GymClass', gymClassSchema);