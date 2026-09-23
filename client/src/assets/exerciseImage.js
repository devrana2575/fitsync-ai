import chest from './exercises/chest.svg';
import back from './exercises/back.svg';
import shoulders from './exercises/shoulders.svg';
import biceps from './exercises/biceps.svg';
import triceps from './exercises/triceps.svg';
import legs from './exercises/legs.svg';
import glutes from './exercises/glutes.svg';
import calves from './exercises/calves.svg';
import forearms from './exercises/forearms.svg';
import core from './exercises/core.svg';
import fullBody from './exercises/full-body.svg';
import cardio from './exercises/cardio.svg';
import fallback from './exercises/fallback.svg';

const KEYWORD_MAP = {
  'chest press': chest,
  'bench press': chest,
  'chest fly': chest,
  'push up': chest,
  'pushup': chest,
  'push-up': chest,
  'incline': chest,
  fly: chest,
  'lat pulldown': back,
  'seated row': back,
  'bent over row': back,
  'pull up': back,
  'pull-up': back,
  row: back,
  'shoulder press': shoulders,
  'overhead press': shoulders,
  'military press': shoulders,
  'lateral raise': shoulders,
  'bicep curl': biceps,
  'wrist curl': forearms,
  curl: biceps,
  'tricep pushdown': triceps,
  tricep: triceps,
  triceps: triceps,
  pushdown: triceps,
  squat: legs,
  'leg press': legs,
  lunge: legs,
  'hip thrust': glutes,
  glute: glutes,
  bridge: glutes,
  'calf raise': calves,
  plank: core,
  crunch: core,
  'sit up': core,
  'sit-up': core,
  ab: core,
  deadlift: fullBody,
  running: cardio,
  run: cardio,
  treadmill: cardio,
  jog: cardio,
  cycling: cardio,
  bike: cardio,
  cardio: cardio,
  stretch: fullBody,
  yoga: fullBody
};

export const EXERCISE_IMAGES = {
  chest,
  back,
  shoulders,
  biceps,
  triceps,
  legs,
  glutes,
  calves,
  forearms,
  core,
  fullBody,
  cardio,
  fallback
};

const MUSCLE_GROUP_MAP = {
  chest: chest,
  back: back,
  shoulders: shoulders,
  biceps: biceps,
  triceps: triceps,
  legs: legs,
  glutes: glutes,
  calves: calves,
  forearms: forearms,
  core: core,
  full_body: fullBody
};

/**
 * Resolve the best illustration for an exercise.
 * @param {string|{name?:string, muscleGroup?:string, category?:string}} exercise
 * @returns {string} asset URL — never returns undefined (falls back to `fallback`)
 */
export function exerciseImage(exercise) {
  if (!exercise) return fallback;
  const name = (typeof exercise === 'string' ? exercise : exercise.name || '').toLowerCase();
  const muscleGroup = typeof exercise === 'object' ? exercise.muscleGroup?.toLowerCase?.() : undefined;
  const category = typeof exercise === 'object' ? exercise.category?.toLowerCase?.() : undefined;
  const kw = Object.keys(KEYWORD_MAP).find((k) => name.includes(k));
  if (kw) return KEYWORD_MAP[kw];
  if (muscleGroup && MUSCLE_GROUP_MAP[muscleGroup]) return MUSCLE_GROUP_MAP[muscleGroup];
  if (category === 'cardio') return cardio;
  if (category === 'flexibility' || category === 'balance' || category === 'plyometric' || category === 'core') return core;
  if (category === 'strength') return fullBody;
  return fallback;
}

export default exerciseImage;