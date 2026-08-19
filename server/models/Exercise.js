const mongoose = require('mongoose');

const exerciseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Exercise name is required'],
    trim: true,
    unique: true
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['strength', 'cardio', 'flexibility', 'balance', 'plyometric', 'core', 'other'],
    default: 'strength'
  },
  muscleGroup: {
    type: String,
    required: [true, 'Muscle group is required'],
    enum: ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core', 'full_body', 'glutes', 'calves', 'forearms']
  },
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'intermediate'
  },
  description: {
    type: String,
    trim: true
  },
  equipment: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

exerciseSchema.index({ category: 1 });
exerciseSchema.index({ muscleGroup: 1 });

module.exports = mongoose.model('Exercise', exerciseSchema);
