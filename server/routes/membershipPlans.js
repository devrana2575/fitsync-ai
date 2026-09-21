const express = require('express');
const router = express.Router();
const MembershipPlan = require('../models/MembershipPlan');
const { auth, authorize } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const PLAN_ALLOCATION_MODES = ['NONE', 'SHARED', 'ASSIGNED', 'DEDICATED'];

const coerceBool = (value) => value === true || value === 'true' || value === 1;

// Mirrors the model's rounding so updates that bypass the save middleware
// (findByIdAndUpdate) still store an exact stored installment amount.
const computeInstallmentAmount = ({ price, paymentMode, installments }) =>
  paymentMode === 'INSTALLMENT' && Number(installments) > 1
    ? Math.round((Number(price) / Number(installments) + Number.EPSILON) * 100) / 100
    : 0;

const normalizePlanPayload = (body) => {
  const {
    name, price, duration, description, features, isActive,
    trainerIncluded, trainerAllocationMode, requiredSpecialization,
    workoutPlanIncluded, paymentMode, installments
  } = body;

  const included = coerceBool(trainerIncluded);
  const paymentModeValue = paymentMode === 'INSTALLMENT' ? 'INSTALLMENT' : 'FULL';
  const allocationMode = included
    ? (trainerAllocationMode || 'SHARED')
    : 'NONE';
  const installmentCount = paymentModeValue === 'INSTALLMENT' ? Number(installments) : 1;

  return {
    name, price, duration, description, features, isActive,
    trainerIncluded: included,
    trainerAllocationMode: allocationMode,
    requiredSpecialization,
    workoutPlanIncluded: coerceBool(workoutPlanIncluded),
    paymentMode: paymentModeValue,
    installments: installmentCount
  };
};

const planConfigValidationError = ({ trainerAllocationMode, paymentMode, installments }) => {
  if (trainerAllocationMode && !PLAN_ALLOCATION_MODES.includes(trainerAllocationMode)) {
    return `Trainer allocation mode must be one of: ${PLAN_ALLOCATION_MODES.join(', ')}`;
  }
  if (paymentMode === 'INSTALLMENT' && (!Number.isInteger(installments) || installments < 2)) {
    return 'Installment plans require at least 2 installments';
  }
  if (paymentMode !== 'INSTALLMENT' && (!Number.isInteger(installments) || installments < 1)) {
    return 'Installments must be a positive integer';
  }
  return null;
};

router.get('/', auth, async (req, res) => {
  try {
    const plans = await MembershipPlan.find({ isActive: true }).sort({ price: 1 }).lean();
    res.json({ plans });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/all', auth, authorize('admin'), async (req, res) => {
  try {
    const plans = await MembershipPlan.find().sort({ createdAt: -1 }).lean();
    res.json({ plans });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, authorize('admin'), [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('price').isNumeric().withMessage('Price is required'),
  body('duration').isInt({ min: 1 }).withMessage('Duration is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const payload = normalizePlanPayload(req.body);
    const configError = planConfigValidationError(payload);
    if (configError) return res.status(400).json({ message: configError });

    const plan = await MembershipPlan.create({
      name: payload.name,
      price: payload.price,
      duration: payload.duration,
      description: payload.description,
      features: payload.features || [],
      isActive: payload.isActive !== undefined ? coerceBool(payload.isActive) : true,
      trainerIncluded: payload.trainerIncluded,
      trainerAllocationMode: payload.trainerAllocationMode,
      requiredSpecialization: payload.requiredSpecialization,
      workoutPlanIncluded: payload.workoutPlanIncluded,
      paymentMode: payload.paymentMode,
      installments: payload.installments
    });
    res.status(201).json({ plan });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const existing = await MembershipPlan.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Plan not found' });

    const payload = normalizePlanPayload({
      ...existing.toObject(),
      ...req.body
    });
    const configError = planConfigValidationError(payload);
    if (configError) return res.status(400).json({ message: configError });

    const update = {};
    if (req.body.name !== undefined) update.name = req.body.name;
    if (req.body.price !== undefined) update.price = req.body.price;
    if (req.body.duration !== undefined) update.duration = req.body.duration;
    if (req.body.description !== undefined) update.description = req.body.description;
    if (req.body.features !== undefined) update.features = req.body.features;
    if (req.body.isActive !== undefined) update.isActive = coerceBool(req.body.isActive);
    if (req.body.trainerIncluded !== undefined || req.body.trainerAllocationMode !== undefined || req.body.requiredSpecialization !== undefined) {
      update.trainerIncluded = payload.trainerIncluded;
      update.trainerAllocationMode = payload.trainerAllocationMode;
      update.requiredSpecialization = payload.requiredSpecialization;
    }
    if (req.body.workoutPlanIncluded !== undefined) update.workoutPlanIncluded = payload.workoutPlanIncluded;
    if (req.body.paymentMode !== undefined || req.body.installments !== undefined) {
      update.paymentMode = payload.paymentMode;
      update.installments = payload.installments;
    }
    if (req.body.price !== undefined || req.body.paymentMode !== undefined || req.body.installments !== undefined) {
      update.installmentAmount = computeInstallmentAmount(payload);
    }

    const plan = await MembershipPlan.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    res.json({ plan });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const plan = await MembershipPlan.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    res.json({ message: 'Plan deactivated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
