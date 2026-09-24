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
  // Financial calculations and trainer entitlement read this snapshot, never
  // the live plan, so editing a plan cannot retroactively rewrite a member's
  // committed terms. A real snapshot always carries the plan `name`; a legacy
  // row without one (pre-snapshot data) falls back to the live plan.
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
    finalInstallmentAmount: {
      type: Number,
      min: 0
    },
    // Exact per-installment schedule as stored on the plan at purchase time
    // (remainder in the final installment), e.g. ₹1000/3 ->
    // [ { seq: 1, amount: 333.33 }, { seq: 2, amount: 333.33 },
    //   { seq: 3, amount: 333.34 } ]. Immutable once committed.
    installmentSchedule: {
      type: [{
        seq: Number,
        amount: Number
      }],
      default: undefined
    },
    features: {
      type: [String],
      default: undefined
    },
    trainerIncluded: {
      type: Boolean
    },
    trainerAllocationMode: {
      type: String,
      enum: ['NONE', 'SHARED', 'ASSIGNED', 'DEDICATED']
    },
    requiredSpecialization: {
      type: String
    },
    workoutPlanIncluded: {
      type: Boolean
    },
    snapshotAt: {
      type: Date
    }
  }
}, {
  timestamps: true
});

// Creation-time capture backstop. Every membership creation path (manual
// counter payments, checkout/Stripe/UPI/Razorpay/demo, seed) must freeze the
// plan terms the contract commits to. The routes set `planSnapshot` explicitly
// with buildPlanSnapshot(); this hook guarantees that no path - current or
// future - can persist a NEW membership without one. Updates never re-run it
// (isNew only), so admin edits / renewals / cancellations never overwrite the
// frozen terms.
membershipSchema.pre('save', async function () {
  if (!this.isNew || !this.plan) return;
  if (this.planSnapshot && this.planSnapshot.name) return;
  try {
    const MembershipPlan = require('./MembershipPlan');
    const { buildPlanSnapshot } = require('../utils/planSnapshot');
    const planDoc = this.plan && this.plan._id ? this.plan : await MembershipPlan.findById(this.plan);
    const snapshot = buildPlanSnapshot(planDoc || this.plan);
    if (snapshot) {
      this.planSnapshot = snapshot;
      this.markModified('planSnapshot');
    }
  } catch (error) {
    // Snapshot capture must never block the membership write; a capture
    // failure degrades to the legacy live-plan fallback, never a crash.
    console.error('[membership] planSnapshot capture failed:', error.message);
  }
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
