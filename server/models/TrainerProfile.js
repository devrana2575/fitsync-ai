const mongoose = require('mongoose');
const { WEEKDAYS } = require('../utils/profileCompletion');

const trainerProfileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  phone: {
    type: String,
    trim: true
  },
  dateOfBirth: {
    type: Date
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
  },
  address: {
    type: String,
    trim: true
  },
  // Body data is informational for trainers (e.g. fitness credentials) and
  // is never part of member health checks.
  heightCm: {
    type: Number,
    min: 40,
    max: 300
  },
  weightKg: {
    type: Number,
    min: 2,
    max: 500
  },
  specializations: [{
    type: String,
    trim: true
  }],
  certifications: [{
    name: { type: String, trim: true },
    issuer: { type: String, trim: true },
    year: { type: Number }
  }],
  experience: {
    type: Number,
    min: 0
  },
  bio: {
    type: String,
    trim: true,
    maxlength: 500
  },
  languages: [{
    type: String,
    trim: true
  }],
  workingDays: [{
    type: String,
    enum: WEEKDAYS
  }],
  workingHours: {
    start: { type: String, trim: true },
    end: { type: String, trim: true }
  },
  maxMembers: {
    type: Number,
    default: 20
  },
  // Operational availability. Absence is recorded explicitly so the gym can
  // see who is unavailable and affected members can be notified. Allocation
  // excludes trainers who are unavailable.
  isAvailable: {
    type: Boolean,
    default: true
  },
  absenceReason: {
    type: String,
    trim: true
  },
  absenceFrom: {
    type: Date
  },
  absenceTo: {
    type: Date
  }
}, {
  timestamps: true
});



module.exports = mongoose.model('TrainerProfile', trainerProfileSchema);
