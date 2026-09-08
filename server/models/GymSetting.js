const mongoose = require('mongoose');

const gymSettingSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    default: ''
  },
  address: {
    type: String,
    trim: true,
    default: ''
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  email: {
    type: String,
    trim: true,
    default: ''
  },
  currency: {
    type: String,
    trim: true,
    default: 'INR'
  },
  timezone: {
    type: String,
    trim: true,
    default: 'Asia/Kolkata'
  },
  operatingHours: {
    type: String,
    trim: true,
    default: ''
  }
}, {
  timestamps: true
});

// Single-document settings row: always reuse the first document.
gymSettingSchema.statics.get = async function () {
  const doc = await this.findOne();
  return doc || null;
};

module.exports = mongoose.model('GymSetting', gymSettingSchema);