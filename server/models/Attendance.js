const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  checkInTime: {
    type: Date,
    required: true,
    default: Date.now
  },
  checkOutTime: {
    type: Date
  },
  method: {
    type: String,
    enum: ['manual', 'qr', 'self'],
    default: 'manual'
  },
  duration: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

attendanceSchema.index({ user: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: -1 });
attendanceSchema.index({ user: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
