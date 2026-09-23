const mongoose = require('mongoose');

const membershipSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MembershipPlan',
    required: true
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'EXPIRED', 'PENDING', 'CANCELLED', 'SUSPENDED'],
    default: 'PENDING'
  },
  // Set the moment a membership becomes ACTIVE (payment completed /
  // complimentary / counter renewal). Preserves when access actually began.
  activatedAt: {
    type: Date,
    default: null
  },
  // Admin suspension context (SUSPENDED status).
  suspendedAt: {
    type: Date,
    default: null
  },
  suspendedReason: {
    type: String,
    trim: true,
    default: ''
  },
  autoRenew: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

membershipSchema.index({ user: 1 });
membershipSchema.index({ status: 1 });
membershipSchema.index({ user: 1, status: 1 });
membershipSchema.index({ endDate: 1 });
membershipSchema.index({ status: 1, endDate: 1 });

module.exports = mongoose.model('Membership', membershipSchema);
