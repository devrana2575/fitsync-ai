import { toINR } from './format';

const TIER_LABELS = {
  basic: 'Essential',
  standard: 'Guided',
  premium: 'Premium',
};

const IDEAL_FOR = {
  basic: 'Casual and first-time members who mainly want gym-floor access without paying for coaching.',
  standard: 'Members who want structure and periodic coaching without the premium price.',
  premium: 'Members who want personalised coaching, premium amenities and priority service.',
};

const TRAINER_LABELS = {
  SHARED: 'Shared trainer support',
  ASSIGNED: 'Assigned personal trainer',
  DEDICATED: 'Dedicated personal trainer',
  NONE: 'Personal trainer',
};

export const planTypeLabel = (duration) => {
  const days = Number(duration) || 0;
  if (days >= 300) return 'Annual';
  if (days >= 150) return 'Half-yearly';
  if (days >= 80) return 'Quarterly';
  if (days >= 25) return 'Monthly';
  return `${days}-day`;
};

export const buildPlanInsights = (plan) => {
  const price = Number(plan?.price) || 0;
  const duration = Number(plan?.duration) || 0;
  const months = duration > 0 ? duration / 30 : 0;
  const monthly = months > 0 ? price / months : price;
  const perDay = duration > 0 ? price / duration : price;
  const tier = monthly >= 2200 ? 'premium' : monthly >= 1200 ? 'standard' : 'basic';

  const notes = [];
  if (duration >= 300) notes.push('Annual plan - the effective monthly cost is lower than shorter plans.');
  if (!plan?.trainerIncluded) notes.push('No personal trainer is included; training is self-guided.');
  else notes.push(`${TRAINER_LABELS[plan.trainerAllocationMode] || 'Personal trainer'} included.`);
  if (!plan?.workoutPlanIncluded) notes.push('A custom workout plan is not included.');
  if (plan?.paymentMode === 'INSTALLMENT' && Number(plan?.installments) > 1) {
    notes.push('Installments are collected at the gym counter; online checkout charges the full price once.');
  }

  return {
    price,
    duration,
    monthly,
    perDay,
    tier,
    tierLabel: TIER_LABELS[tier],
    idealFor: IDEAL_FOR[tier],
    notes,
  };
};

export const buildPlanInclusions = (plan) => {
  const items = Array.isArray(plan?.features) ? plan.features.filter(Boolean) : [];
  if (plan?.trainerIncluded) items.push(TRAINER_LABELS[plan.trainerAllocationMode] || 'Personal trainer');
  if (plan?.workoutPlanIncluded) items.push('Personalised workout plan');
  if (plan?.paymentMode === 'INSTALLMENT' && Number(plan?.installments) > 1) {
    items.push(`${plan.installments} installments of ${toINR(plan.installmentAmount)} (counter only)`);
  }
  return [...new Set(items)];
};
