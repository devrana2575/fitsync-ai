const express = require('express');
const router = express.Router();
const FoodItem = require('../models/FoodItem');
const MealPlan = require('../models/MealPlan');
const NutritionLog = require('../models/NutritionLog');
const { auth, authorize } = require('../middleware/auth');
const { escapeRegex } = require('../utils/helpers');

const macroPerQuantity = (food, qty) => ({
  calories: Math.round((food.calories || 0) * qty),
  protein: Math.round((food.protein || 0) * qty * 10) / 10,
  carbs: Math.round((food.carbs || 0) * qty * 10) / 10,
  fat: Math.round((food.fat || 0) * qty * 10) / 10
});

// ----------------------------------------------------------------
// Food database
// ----------------------------------------------------------------
router.get('/foods', auth, async (req, res) => {
  try {
    const { search, category, limit = 200, page = 1 } = req.query;
    const filter = { isActive: true };
    if (search) filter.name = { $regex: escapeRegex(search), $options: 'i' };
    if (category && category !== 'all') filter.category = category;
    const total = await FoodItem.countDocuments(filter);
    const foods = await FoodItem.find(filter).sort({ name: 1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Math.min(Number(limit), 500)).lean();
    res.json({ foods, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/foods', auth, authorize('admin', 'trainer', 'member'), async (req, res) => {
  try {
    const { name, category, servingSize, servingUnit, calories, protein, carbs, fat } = req.body;
    if (!name) return res.status(400).json({ message: 'Food name is required' });
    const isCustom = req.user.role !== 'admin';
    const food = await FoodItem.create({
      name,
      category: category || 'other',
      servingSize: servingSize || 100,
      servingUnit: servingUnit || 'g',
      calories: calories || 0,
      protein: protein || 0,
      carbs: carbs || 0,
      fat: fat || 0,
      isCustom,
      createdBy: req.user._id
    });
    res.status(201).json({ food });
  } catch (error) {
    if (error.code === 11000) {
      const existing = await FoodItem.findOne({ name: { $regex: `^${escapeRegex(req.body.name)}$`, $options: 'i' } });
      return res.status(200).json({ food: existing, message: 'Food item already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/foods/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const allowed = ['name', 'category', 'servingSize', 'servingUnit', 'calories', 'protein', 'carbs', 'fat', 'isActive'];
    const update = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const food = await FoodItem.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!food) return res.status(404).json({ message: 'Food not found' });
    res.json({ food });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/foods/:id', auth, authorize('admin', 'trainer', 'member'), async (req, res) => {
  try {
    const food = await FoodItem.findById(req.params.id);
    if (!food) return res.status(404).json({ message: 'Food not found' });
    if (req.user.role !== 'admin' && String(food.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only delete your own food items' });
    }
    food.isActive = false;
    await food.save();
    res.json({ message: 'Food item removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ----------------------------------------------------------------
// Meal plans
// ----------------------------------------------------------------
router.get('/plans', auth, async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'member') {
      filter.assignedTo = req.user._id;
      filter.isActive = true;
    } else if (req.user.role === 'trainer') {
      filter.createdBy = req.user._id;
    }
    const plans = await MealPlan.find(filter)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name')
      .populate('meals.items.food', 'name servingSize servingUnit calories protein carbs fat');
    res.json({ plans });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/plans', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const { name, description, assignedTo, meals, startDate, endDate } = req.body;
    if (!name) return res.status(400).json({ message: 'Plan name is required' });

    const populatedMeals = [];
    let dailyCalories = 0, dailyProtein = 0, dailyCarbs = 0, dailyFat = 0;

    const foodIds = [...new Set((meals || []).flatMap((meal) => (meal.items || []).map((item) => item.food)))];
    const foods = foodIds.length ? await FoodItem.find({ _id: { $in: foodIds }, isActive: true }).select('_id calories protein carbs fat').lean() : [];
    const foodById = new Map(foods.map((f) => [String(f._id), f]));

    for (const meal of meals || []) {
      const populatedItems = [];
      for (const item of meal.items || []) {
        const food = foodById.get(String(item.food));
        if (!food) continue;
        const macros = macroPerQuantity(food, item.quantity || 1);
        dailyCalories += macros.calories;
        dailyProtein += macros.protein;
        dailyCarbs += macros.carbs;
        dailyFat += macros.fat;
        populatedItems.push({ food: food._id, quantity: item.quantity || 1 });
      }
      populatedMeals.push({ mealType: meal.mealType, items: populatedItems, notes: meal.notes });
    }

    const plan = await MealPlan.create({
      name,
      description,
      createdBy: req.user._id,
      assignedTo,
      meals: populatedMeals,
      dailyCalories: Math.round(dailyCalories),
      dailyProtein: Math.round(dailyProtein),
      dailyCarbs: Math.round(dailyCarbs),
      dailyFat: Math.round(dailyFat),
      startDate,
      endDate
    });
    res.status(201).json({ plan });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/plans/:id', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const plan = await MealPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    if (req.user.role === 'trainer' && String(plan.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only edit your own plans' });
    }
    const allowed = ['name', 'description', 'assignedTo', 'startDate', 'endDate', 'isActive'];
    const update = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const updated = await MealPlan.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json({ plan: updated });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/plans/:id', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const plan = await MealPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    if (req.user.role === 'trainer' && String(plan.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only delete your own plans' });
    }
    plan.isActive = false;
    await plan.save();
    res.json({ message: 'Plan deactivated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ----------------------------------------------------------------
// Nutrition logs
// ----------------------------------------------------------------
router.get('/log', auth, authorize('member'), async (req, res) => {
  try {
    const { date } = req.query;
    const filter = { user: req.user._id };
    if (date) {
      const day = new Date(`${date}T00:00:00`);
      if (!isNaN(day.getTime())) {
        const next = new Date(day);
        next.setDate(next.getDate() + 1);
        filter.date = { $gte: day, $lt: next };
      }
    } else {
      filter.date = { $gte: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) };
    }
    const logs = await NutritionLog.find(filter).populate('meals.food', 'name servingSize servingUnit calories protein carbs fat').sort({ date: -1 }).limit(90).lean();
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/log', auth, authorize('member'), async (req, res) => {
  try {
    const { date, mealType, foodId, quantity } = req.body;
    if (!foodId) return res.status(400).json({ message: 'Food item is required' });
    const food = await FoodItem.findOne({ _id: foodId, isActive: true });
    if (!food) return res.status(404).json({ message: 'Food item not found' });

    const logDate = date ? new Date(date) : new Date();
    logDate.setHours(0, 0, 0, 0);
    let log = await NutritionLog.findOne({ user: req.user._id, date: logDate });
    if (!log) {
      log = await NutritionLog.create({ user: req.user._id, date: logDate });
    }

    const macros = macroPerQuantity(food, quantity || 1);
    log.meals.push({
      mealType: mealType || 'snack',
      food: food._id,
      quantity: quantity || 1,
      ...macros
    });
    log.totalCalories += macros.calories;
    log.totalProtein += macros.protein;
    log.totalCarbs += macros.carbs;
    log.totalFat += macros.fat;
    await log.save();

    const populated = await NutritionLog.populate(log, { path: 'meals.food', select: 'name servingSize servingUnit calories protein carbs fat' });
    res.status(201).json({ log: populated });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/log/water', auth, authorize('member'), async (req, res) => {
  try {
    const { date, waterGlasses } = req.body;
    const logDate = date ? new Date(date) : new Date();
    logDate.setHours(0, 0, 0, 0);
    let log = await NutritionLog.findOne({ user: req.user._id, date: logDate });
    if (!log) log = await NutritionLog.create({ user: req.user._id, date: logDate });
    log.waterGlasses = Math.max(0, Math.min(30, waterGlasses || 0));
    await log.save();
    res.json({ log });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/log/:entryId', auth, authorize('member'), async (req, res) => {
  try {
    const log = await NutritionLog.findOne({ user: req.user._id, 'meals._id': req.params.entryId });
    if (!log) return res.status(404).json({ message: 'Entry not found' });
    const entry = log.meals.id(req.params.entryId);
    log.totalCalories -= entry.calories || 0;
    log.totalProtein -= entry.protein || 0;
    log.totalCarbs -= entry.carbs || 0;
    log.totalFat -= entry.fat || 0;
    log.meals.pull(req.params.entryId);
    await log.save();
    res.json({ message: 'Meal entry removed', log });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ----------------------------------------------------------------
// Stats
// ----------------------------------------------------------------
router.get('/stats', auth, authorize('member'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const logs = await NutritionLog.find({ user: req.user._id, date: { $gte: new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000) } })
      .select('date totalCalories totalProtein totalCarbs totalFat')
      .sort({ date: -1 })
      .limit(21)
      .lean();
    const avgCalories = logs.length ? Math.round(logs.reduce((s, l) => s + l.totalCalories, 0) / logs.length) : 0;
    const avgProtein = logs.length ? Math.round(logs.reduce((s, l) => s + l.totalProtein, 0) / logs.length) : 0;
    res.json({ totalDays: logs.length, avgCalories, avgProtein, sevenDay: logs });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;