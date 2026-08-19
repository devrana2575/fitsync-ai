const mongoose = require('mongoose');

const bodyMeasurementSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  weight: {
    type: Number,
    min: 0
  },
  height: {
    type: Number,
    min: 0
  },
  bmi: {
    type: Number
  },
  bodyFat: {
    type: Number,
    min: 0,
    max: 100
  },
  chest: { type: Number, min: 0 },
  waist: { type: Number, min: 0 },
  hips: { type: Number, min: 0 },
  biceps: { type: Number, min: 0 },
  thighs: { type: Number, min: 0 }
}, {
  timestamps: true
});

bodyMeasurementSchema.pre('save', function(next) {
  if (this.weight && this.height) {
    const heightInMeters = this.height / 100;
    this.bmi = parseFloat((this.weight / (heightInMeters * heightInMeters)).toFixed(1));
  }
  next();
});

bodyMeasurementSchema.index({ user: 1, date: -1 });

module.exports = mongoose.model('BodyMeasurement', bodyMeasurementSchema);
