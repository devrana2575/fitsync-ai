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
  },
  // Immutable commercial terms captured at creation (see utils/planSnapshot).
  // Financial calculations read this snapshot, never the live plan, so editing
  // a plan cannot retroactively rewrite a member's committed terms.
  planSnapshot: {
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MembershipPlan'
    },
    name: {
      type: String,
      trim: true
    },
    price: {
      type: Number,
      min: 0
    },
    duration: {
      type: Number,
      min: 0
    },
    paymentMode: {
      type: String,
      enum: ['FULL', 'INSTALLMENT']
    },
    installments: {
      type: Number,
      min: 1
    },
    installmentAmount: {
      type: Number,
      min: 0
    },
    snapshotAt: {
      type: Date
    }
  }
}, {
  timestamps: true
});

membershipSchema.index({ user: 1 });
membershipSchema.index({ status: 1 });
membershipSchema.index({ user: 1, status: 1 });
membershipSchema.index({ endDate: 1 });
membershipSchema.index({ status: 1, endDate: 1 });
// At most ONE ACTIVE membership per user. The partial filter restricts the
// unique constraint to ACTIVE rows only, so historical PENDING/EXPIRED/
// CANCELLED/SUSPENDED records for the same user stay legal and the DB itself
// rejects a second concurrent ACTIVE activation (E11000 retried upstream).
// The explicit name keeps it distinct from the plain { user: 1 } index (whose
// auto-generated name would otherwise collide with this one).
membershipSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { status: 'ACTIVE' }, name: 'user_1_active' });

module.exports = mongoose.model('Membership', membershipSchema);
