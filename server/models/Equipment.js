const mongoose = require('mongoose');

const equipmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Equipment name is required'],
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['cardio', 'strength', 'free_weights', 'machines', 'accessories', 'other'],
    default: 'strength'
  },
  brand: {
    type: String,
    trim: true
  },
  model: {
    type: String,
    trim: true
  },
  condition: {
    type: String,
    enum: ['excellent', 'good', 'fair', 'poor', 'needs_repair'],
    default: 'good'
  },
  status: {
    type: String,
    enum: ['available', 'in_use', 'under_maintenance', 'out_of_order', 'issue_reported'],
    default: 'available'
  },
  // When a piece of equipment is reported with a problem (status:
  // issue_reported), the admin/staff who reported it and their description
  // are captured so the operational issue is auditable and can generate an
  // admin notification.
  reportedIssue: {
    type: String,
    trim: true
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reportedAt: {
    type: Date
  },
  purchaseDate: {
    type: Date
  },
  lastMaintenance: {
    type: Date
  },
  nextMaintenance: {
    type: Date
  },
  location: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  description: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

equipmentSchema.index({ nextMaintenance: 1, isActive: 1 });

module.exports = mongoose.model('Equipment', equipmentSchema);
