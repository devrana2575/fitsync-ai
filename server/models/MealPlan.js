const mongoose = require('mongoose');

const mealPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Meal plan name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  meals: [{
    mealType: {
      type: String,
      enum: ['breakfast', 'lunch', 'snack', 'dinner'],
      required: true
    },
    items: [{
      food: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FoodItem',
        required: true
      },
      quantity: {
        type: Number,
        min: 0.01,
        default: 1
      }
    }],
    notes: {
      type: String,
      trim: true
    }
  }],
  dailyCalories: {
    type: Number,
    default: 0
  },
  dailyProtein: {
    type: Number,
    default: 0
  },
  dailyCarbs: {
    type: Number,
    default: 0
  },
  dailyFat: {
    type: Number,
    default: 0
  },
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

mealPlanSchema.index({ assignedTo: 1, isActive: 1 });
mealPlanSchema.index({ createdBy: 1, isActive: 1 });

module.exports = mongoose.model('MealPlan', mealPlanSchema);