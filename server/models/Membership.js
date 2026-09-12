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
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GymBranch'
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
    enum: ['ACTIVE', 'EXPIRED', 'PENDING', 'CANCELLED'],
    default: 'PENDING'
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

module.exports = mongoose.model('Membership', membershipSchema);
