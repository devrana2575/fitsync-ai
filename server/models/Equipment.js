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
    enum: ['available', 'in_use', 'under_maintenance', 'out_of_order'],
    default: 'available'
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
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

equipmentSchema.index({ nextMaintenance: 1, isActive: 1 });

module.exports = mongoose.model('Equipment', equipmentSchema);
