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
  // Business day key (YYYY-MM-DD in the gym timezone). Uniqueness for
  // check-ins is keyed on user + dayKey so that two rapid check-ins on the
  // same gym day collapse into a single record.
  dayKey: {
    type: String
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
// One check-in per member per gym day. Partial so pre-dayKey legacy rows
// remain untouched while new records get the full uniqueness guarantee.
attendanceSchema.index({ user: 1, dayKey: 1 }, { unique: true, partialFilterExpression: { dayKey: { $type: 'string' } } });
attendanceSchema.index({ date: -1 });
attendanceSchema.index({ user: 1 });
attendanceSchema.index({ user: 1, checkInTime: -1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
