const mongoose = require('mongoose');

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
    default: 0
  },
  bio: {
    type: String,
    trim: true,
    maxlength: 500
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
