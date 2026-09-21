const mongoose = require('mongoose');

// Convenient stable currency rounding for installment amounts. The server is
// authoritative for all money maths - prices are stored in major units (INR)
// and installments are derived deterministically from the configured price.
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const membershipPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Plan name is required'],
    trim: true,
    unique: true
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: 0
  },
  duration: {
    type: Number,
    required: [true, 'Duration in days is required'],
    min: 1
  },
  description: {
    type: String,
    trim: true
  },
  // Included services as free text, e.g. ["Gym access", "Assigned trainer",
  // "Workout plan"]. Shown to members when comparing plans.
  features: [{
    type: String,
    trim: true
  }],
  // ---- Trainer entitlement ------------------------------------------------
  // The plan is the commercial product; trainer support is an entitlement of
  // the plan, not a separate charge. trainerIncluded=false means no trainer is
  // allocated to members of this plan.
  trainerIncluded: {
    type: Boolean,
    default: false
  },
  // How included trainer support is delivered.
  // NONE      - no trainer service
  // SHARED    - gym roster trainers provide floor support (one is allocated
  //             as the point of contact for record-keeping)
  // ASSIGNED  - a specific trainer manages the member
  // DEDICATED - a dedicated trainer for the member (same allocation rules)
  trainerAllocationMode: {
    type: String,
    enum: ['NONE', 'SHARED', 'ASSIGNED', 'DEDICATED'],
    default: 'NONE'
  },
  // Optional specialization requirement used as a filter when allocating a
  // trainer (e.g. "Weight Loss"). Purely informational - never medical advice.
  requiredSpecialization: {
    type: String,
    trim: true
  },
  workoutPlanIncluded: {
    type: Boolean,
    default: false
  },
  // ---- Payment configuration ----------------------------------------------
  // FULL        - single payment equal to plan.price completes the plan
  // INSTALLMENT - the plan explicitly permits fixed installments. Every
  //               recorded payment must equal `installmentAmount` exactly;
  //               arbitrary partial amounts are rejected. The membership
  //               becomes ACTIVE only after the full plan price is covered.
  paymentMode: {
    type: String,
    enum: ['FULL', 'INSTALLMENT'],
    default: 'FULL'
  },
  installments: {
    type: Number,
    min: 1,
    default: 1
  },
  // Fixed per-installment amount derived from price/installments. Stored (not
  // recomputed per payment) so a price edit does not silently change what an
  // active installment run may charge. Zero for FULL plans.
  installmentAmount: {
    type: Number,
    min: 0,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

membershipPlanSchema.index({ isActive: 1, price: 1 });
membershipPlanSchema.index({ createdAt: -1 });

membershipPlanSchema.pre('validate', function (next) {
  if (this.paymentMode === 'INSTALLMENT') {
    if (!Number.isInteger(this.installments) || this.installments < 2) {
      return next(new Error('Payment mode INSTALLMENT requires at least 2 installments'));
    }
  }
  next();
});

membershipPlanSchema.pre('save', function (next) {
  if (this.isModified('price') || this.isModified('installments') || this.isModified('paymentMode')) {
    if (this.paymentMode === 'INSTALLMENT' && this.installments > 1) {
      this.installmentAmount = round2(Number(this.price) / this.installments);
    } else {
      this.installmentAmount = 0;
    }
  }
  if (!this.trainerIncluded) this.trainerAllocationMode = 'NONE';
  next();
});

module.exports = mongoose.model('MembershipPlan', membershipPlanSchema);