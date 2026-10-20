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
  },
  // ---- Membership-level trainer assignment (source of truth) ---------------
  // A user may hold several ACTIVE memberships at once, each with its own
  // independent trainer. MemberProfile.assignedTrainer stays as a COMPATIBILITY
  // mirror (single scalar used by legacy roster/read paths) but never as the
  // authority for membership-specific assignment.
  //
  // assignmentInitialized=false means this row predates membership-level
  // assignment (legacy data) - readers fall back to the profile-level value
  // rather than inventing a trainer for every membership.
  trainerAssignment: {
    assignmentInitialized: {
      type: Boolean,
      default: false
    },
    // Trainer the member bought the service from. Never overwritten by a
    // temporary sick-leave cover.
    originalTrainer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    // Who is coaching right now (equals originalTrainer in the normal case).
    currentTrainer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    status: {
      type: String,
      enum: ['NONE', 'PENDING', 'ASSIGNED'],
      default: 'NONE'
    },
    pendingReason: {
      type: String,
      trim: true,
      default: ''
    },
    temporaryReplacement: {
      type: Boolean,
      default: false
    },
    // Approved TrainerSickLeave that installed the temporary cover.
    sickLeave: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TrainerSickLeave',
      default: null
    },
    assignedAt: {
      type: Date,
      default: null
    },
    updatedAt: {
      type: Date,
      default: null
    },
    // Append-only transition log. Never rewritten by general data-edit
    // endpoints; restoration appends, never deletes.
    history: {
      type: [{
        previousTrainer: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          default: null
        },
        newTrainer: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          default: null
        },
        reason: {
          type: String,
          enum: ['INITIAL', 'SICK_LEAVE', 'RETURN_FROM_LEAVE', 'ADMIN_CHANGE'],
          required: true
        },
        sickLeave: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'TrainerSickLeave',
          default: null
        },
        actor: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          default: null
        },
        note: {
          type: String,
          trim: true,
          default: ''
        },
        at: {
          type: Date,
          default: Date.now
        }
      }],
      default: []
    }
  }
}, {
  timestamps: true,
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
// Multiple ACTIVE memberships per user are a supported business rule: each
// membership carries its own plan, payment lifecycle and trainer assignment.
// (The previous { user: 1 } unique partial index filtered to status ACTIVE -
// index name `user_1_active` - was removed; run scripts/migrate-membership-
// independence.js against an existing database to drop it there too.)
membershipSchema.index({ 'trainerAssignment.currentTrainer': 1 });
membershipSchema.index({ 'trainerAssignment.sickLeave': 1 });

module.exports = mongoose.model('Membership', membershipSchema);
