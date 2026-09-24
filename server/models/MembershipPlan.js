const mongoose = require('mongoose');

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
  // INSTALLMENT - the plan explicitly permits fixed installments. Paid
  //               OFF-LINE (gym counter / cash / UPI); every recorded payment
  //               must equal the NEXT DUE amount in the exact
  //               `installmentSchedule` (remainder in the final installment,
  //               so the schedule sums EXACTLY to price) - arbitrary partial
  //               amounts are rejected. The membership becomes ACTIVE only
  //               after the full plan price is covered. Online checkouts
  //               charge the full price in one payment and are never
  //               validated here.
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
  // Amount of the FINAL (nth) installment. When price does not divide evenly
  // into the requested installment count the remainder (in integer paise) is
  // added here, so sum(installments) === price exactly. Equals installmentAmount
  // when price divides evenly. Zero for FULL plans.
  finalInstallmentAmount: {
    type: Number,
    min: 0,
    default: 0
  },
  // Exact per-installment schedule: [{ seq, amount }] for seq 1..installments.
  // Amounts sum EXACTLY to price (integer-paise math; the remainder lands in
  // the final entry). Empty for FULL plans. Read-only - derived in pre('save').
  installmentSchedule: {
    type: [{
      seq: Number,
      amount: Number
    }],
    default: []
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

// Exact installment schedule in integer paise: pricePaise / installments with
// the remainder accumulated into the FINAL installment. Because every amount
// is an exact paise-derived 2dp value, the schedule sums EXACTLY to price
// (sum(installmentSchedule amounts) === pricePaise / 100 === price).
membershipPlanSchema.pre('save', function (next) {
  if (this.isModified('price') || this.isModified('installments') || this.isModified('paymentMode')) {
    if (this.paymentMode === 'INSTALLMENT' && this.installments > 1) {
      const pricePaise = Math.round(Number(this.price) * 100);
      const n = this.installments;
      if (!Number.isInteger(pricePaise) || pricePaise <= 0) {
        this.installmentAmount = 0;
        this.finalInstallmentAmount = 0;
        this.installmentSchedule = [];
      } else {
        const basePaise = Math.floor(pricePaise / n);
        const finalPaise = pricePaise - basePaise * (n - 1);
        this.installmentAmount = basePaise / 100;
        this.finalInstallmentAmount = finalPaise / 100;
        this.installmentSchedule = Array.from({ length: n }, (_, i) => ({
          seq: i + 1,
          amount: (i === n - 1 ? finalPaise : basePaise) / 100
        }));
      }
    } else {
      this.installmentAmount = 0;
      this.finalInstallmentAmount = 0;
      this.installmentSchedule = [];
    }
  }
  if (!this.trainerIncluded) this.trainerAllocationMode = 'NONE';
  next();
});

module.exports = mongoose.model('MembershipPlan', membershipPlanSchema);