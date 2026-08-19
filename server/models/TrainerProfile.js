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
  }
}, {
  timestamps: true
});



module.exports = mongoose.model('TrainerProfile', trainerProfileSchema);
