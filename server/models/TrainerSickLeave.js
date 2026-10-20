const mongoose = require('mongoose');

// Trainer sick leave. Drives the temporary-replacement workflow: an admin
// approves a leave (medical certificate required), the approved leave installs
// a temporary cover on every ACTIVE membership the absent trainer currently
// coaches, and the same leave restores the original trainers when it ends.
//
// Lifecycle:
//   PENDING   -> submitted by the trainer (certificate optional here)
//   APPROVED  -> admin approved (certificate REQUIRED at approval) + coverage
//                installed (idempotent - safe to re-run)
//   REJECTED  -> admin rejected with a review note (no coverage touched)
//   CANCELLED -> trainer withdrew it (restores any installed coverage first)
//   COMPLETED -> approved leave whose end date passed and whose original
//                trainers were restored by the reconcile sweep
//
// Medical privacy: the certificate itself never leaves the private storage
// directory; only its metadata (mime/size/timestamp) lives on this document,
// and `hasCertificate` is what lists expose. Bytes are streamed through an
// authenticated, audited route only.
const trainerSickLeaveSchema = new mongoose.Schema({
  trainer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Inclusive date range expressed in the gym's local calendar days.
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  medicalCertificate: {
    filename: {
      type: String,
      default: ''
    },
    mime: {
      type: String,
      default: ''
    },
    size: {
      type: Number,
      min: 0,
      default: 0
    },
    uploadedAt: {
      type: Date,
      default: null
    }
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'],
    default: 'PENDING'
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  reviewNote: {
    type: String,
    trim: true,
    default: '',
    maxlength: 500
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  // Coverage bookkeeping. The entries make cover installation and restoration
  // exact and idempotent: restoration only touches memberships still wearing
  // THIS leave's cover (an admin who reassigned during the leave wins and is
  // never silently reverted).
  coverage: {
    entries: {
      type: [{
        membership: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Membership'
        },
        replacement: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      }],
      default: []
    },
    uncovered: {
      type: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Membership'
      }],
      default: []
    },
    installedAt: {
      type: Date,
      default: null
    },
    restoredAt: {
      type: Date,
      default: null
    }
  }
}, {
  timestamps: true
});

trainerSickLeaveSchema.pre('validate', function (next) {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate('endDate', 'endDate must be on or after startDate');
  }
  next();
});

trainerSickLeaveSchema.virtual('hasCertificate').get(function () {
  return Boolean(this.medicalCertificate && this.medicalCertificate.filename);
});

trainerSickLeaveSchema.index({ trainer: 1, status: 1 });
trainerSickLeaveSchema.index({ status: 1, endDate: 1 });
trainerSickLeaveSchema.index({ trainer: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('TrainerSickLeave', trainerSickLeaveSchema);
