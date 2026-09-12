const mongoose = require('mongoose');

const foodItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Food name is required'],
    trim: true
  },
  category: {
    type: String,
    enum: ['breakfast', 'lunch', 'dinner', 'snack', 'protein', 'vegetable', 'fruit', 'dairy', 'grains', 'beverage', 'other'],
    default: 'other'
  },
  servingSize: {
    type: Number,
    default: 100
  },
  servingUnit: {
    type: String,
    trim: true,
    default: 'g'
  },
  calories: {
    type: Number,
    min: 0,
    default: 0
  },
  protein: {
    type: Number,
    min: 0,
    default: 0
  },
  carbs: {
    type: Number,
    min: 0,
    default: 0
  },
  fat: {
    type: Number,
    min: 0,
    default: 0
  },
  isCustom: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

foodItemSchema.index({ name: 1, isActive: 1 });
foodItemSchema.index({ category: 1, isActive: 1 });

module.exports = mongoose.model('FoodItem', foodItemSchema);