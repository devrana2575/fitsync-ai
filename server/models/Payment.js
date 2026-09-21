const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  membership: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Membership'
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: 0
  },
  method: {
    type: String,
    enum: ['cash', 'card', 'upi', 'bank_transfer', 'online'],
    default: 'cash'
  },
  status: {
    type: String,
    enum: ['COMPLETED', 'PENDING', 'FAILED', 'REFUNDED'],
    default: 'PENDING'
  },
  transactionId: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  // Authorized confirmation audit trail for manually verified payments
  // (e.g. UPI scan-to-pay confirmed by gym staff, or cash taken at the
  // counter). Populated when a payment transitions to COMPLETED through the
  // verify/admin path; Stripe webhook confirmations are attributed to the
  // gateway and leave these blank.
  confirmedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  confirmedAt: {
    type: Date
  },
  // Gateway metadata for online payments. gatewayOrderId / gatewayPaymentId /
  // gatewayEventId are unique (sparse) so no two payments can track the same
  // upstream object and every verified signature / webhook payload maps back
  // to exactly one local payment.
  gateway: {
    type: String,
    enum: ['razorpay', 'stripe']
  },
  gatewayOrderId: {
    type: String,
    trim: true
  },
  gatewayPaymentId: {
    type: String,
    trim: true
  },
  gatewaySignature: {
    type: String,
    trim: true
  },
  gatewayStatus: {
    type: String,
    trim: true
  },
  gatewayVerifiedAt: {
    type: Date
  },
  gatewayEventId: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

paymentSchema.index({ user: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ date: -1 });
paymentSchema.index({ user: 1, date: -1 });
paymentSchema.index({ status: 1, date: -1 });
paymentSchema.index({ gatewayOrderId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ gatewayPaymentId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ gatewayEventId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Payment', paymentSchema);
