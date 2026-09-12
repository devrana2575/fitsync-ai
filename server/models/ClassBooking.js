const mongoose = require('mongoose');

const classBookingSchema = new mongoose.Schema({
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ClassSession',
    required: [true, 'Session reference is required']
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  status: {
    type: String,
    enum: ['booked', 'waitlisted', 'cancelled'],
    default: 'booked'
  },
  checkedIn: {
    type: Boolean,
    default: false
  },
  bookedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

classBookingSchema.index({ session: 1, user: 1 }, { unique: true });
classBookingSchema.index({ user: 1, status: 1, bookedAt: -1 });

module.exports = mongoose.model('ClassBooking', classBookingSchema);