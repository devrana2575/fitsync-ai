const mongoose = require('mongoose');

const DIET_TYPES = Object.freeze({
  keto: 'Keto',
  vegan: 'Vegan',
  vegetarian: 'Vegetarian',
  paleo: 'Paleo',
  mediterranean: 'Mediterranean',
  intermittent_fasting: 'Intermittent Fasting',
  high_protein: 'High Protein',
  low_carb: 'Low Carb'
});

const dietLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  date: {
    type: Date,
    required: [true, 'Date is required']
  },
  completedDiets: [{
    type: String,
    enum: Object.keys(DIET_TYPES)
  }]
}, {
  timestamps: true
});

dietLogSchema.index({ user: 1, date: 1 }, { unique: true });
dietLogSchema.index({ user: 1, date: -1 });

module.exports = mongoose.model('DietLog', dietLogSchema);
module.exports.DIET_TYPES = DIET_TYPES;