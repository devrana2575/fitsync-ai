const mongoose = require('mongoose');

const memberProfileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
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
  assignedTrainer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  joinDate: {
    type: Date,
    default: Date.now
  },
  medicalConditions: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

memberProfileSchema.index({ assignedTrainer: 1 });

module.exports = mongoose.model('MemberProfile', memberProfileSchema);
