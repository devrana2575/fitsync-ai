const mongoose = require('mongoose');

const nutritionLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  date: {
    type: Date,
    required: [true, 'Date is required']
  },
  meals: [{
    mealType: {
      type: String,
      enum: ['breakfast', 'lunch', 'snack', 'dinner'],
      required: true
    },
    food: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodItem',
      required: true
    },
    quantity: {
      type: Number,
      min: 0.01,
      default: 1
    },
    calories: {
      type: Number,
      default: 0
    },
    protein: {
      type: Number,
      default: 0
    },
    carbs: {
      type: Number,
      default: 0
    },
    fat: {
      type: Number,
      default: 0
    },
    loggedAt: {
      type: Date,
      default: Date.now
    }
  }],
  waterGlasses: {
    type: Number,
    min: 0,
    max: 30,
    default: 0
  },
  totalCalories: {
    type: Number,
    default: 0
  },
  totalProtein: {
    type: Number,
    default: 0
  },
  totalCarbs: {
    type: Number,
    default: 0
  },
  totalFat: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

nutritionLogSchema.index({ user: 1, date: 1 }, { unique: true });
nutritionLogSchema.index({ user: 1, date: -1 });

module.exports = mongoose.model('NutritionLog', nutritionLogSchema);