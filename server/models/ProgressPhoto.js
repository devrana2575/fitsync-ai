const mongoose = require('mongoose');

const progressPhotoSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  url: {
    type: String,
    required: [true, 'Photo URL is required']
  },
  caption: {
    type: String,
    trim: true,
    maxlength: 200
  },
  angle: {
    type: String,
    enum: ['front', 'side', 'back', 'full', 'other'],
    default: 'other'
  },
  date: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

progressPhotoSchema.index({ user: 1, date: -1 });

module.exports = mongoose.model('ProgressPhoto', progressPhotoSchema);