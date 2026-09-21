const mongoose = require('mongoose');
const { WEEKDAYS, ACTIVITY_LEVELS } = require('../utils/profileCompletion');

const memberProfileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  // Multiple contact numbers. The first element labelled Primary drives the
  // legacy `phone` field (used by notifications/messaging display). Duplicate
  // numbers within the list are rejected at the route layer.
  phoneNumbers: [{
    number: {
      type: String,
      trim: true,
      match: [/^[\+]?[\d\s\-\(\)]{7,15}$/, 'Please provide a valid phone number']
    },
    label: {
      type: String,
      enum: ['Primary', 'Secondary', 'Emergency', 'Work', 'Home', 'Other'],
      default: 'Primary'
    }
  }],
  phone: {
    type: String,
    trim: true,
    match: [/^[\+]?[\d\s\-\(\)]{7,15}$/, 'Please provide a valid phone number']
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
  emergencyContact: {
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    relationship: { type: String, trim: true }
  },
  // --- Body / fitness profile ----------------------------------------------
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
  goals: [{
    type: String,
    trim: true
  }],
  activityLevel: {
    type: String,
    enum: ACTIVITY_LEVELS
  },
  preferredWorkoutDays: [{
    type: String,
    enum: WEEKDAYS
  }],
  preferredWorkoutDuration: {
    type: Number,
    min: 15,
    max: 300
  },
  // --- Health information ---------------------------------------------------
  // Informational only. Never used to synthesise medical advice. A doctor's
  // recommendation may be recorded verbatim and is visually distinct from
  // trainer recommendations and system suggestions.
  medicalConditions: {
    type: String,
    trim: true
  },
  injuries: {
    type: String,
    trim: true
  },
  medicalNotes: {
    type: String,
    trim: true
  },
  allergies: [{
    type: String,
    trim: true
  }],
  medicalRestrictions: {
    type: String,
    trim: true
  },
  doctorRecommendation: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  trainerRecommendation: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  // --- Trainer assignment ---------------------------------------------------
  // Set through the allocation business route after a paid membership becomes
  // ACTIVE, or by an admin. AllData cannot change these.
  assignedTrainer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  trainerAssignmentStatus: {
    type: String,
    enum: ['NONE', 'PENDING', 'ASSIGNED'],
    default: 'NONE'
  },
  pendingTrainerReason: {
    type: String,
    trim: true
  },
  assignedAt: {
    type: Date
  },
  joinDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

memberProfileSchema.index({ assignedTrainer: 1 });
memberProfileSchema.index({ assignedTrainer: 1, trainerAssignmentStatus: 1 });

// Keep the legacy scalar `phone` in sync with the primary contact number.
memberProfileSchema.pre('save', function (next) {
  if (this.isModified('phoneNumbers') && Array.isArray(this.phoneNumbers) && this.phoneNumbers.length > 0) {
    const primary = this.phoneNumbers.find((p) => p.label === 'Primary') || this.phoneNumbers[0];
    if (primary && primary.number) this.phone = primary.number;
  }
  next();
});

module.exports = mongoose.model('MemberProfile', memberProfileSchema);