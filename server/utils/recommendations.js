const WorkoutTemplate = require('../models/WorkoutTemplate');
const FitnessGoal = require('../models/FitnessGoal');
const Attendance = require('../models/Attendance');
const WorkoutLog = require('../models/WorkoutLog');
const BodyMeasurement = require('../models/BodyMeasurement');
const MemberProfile = require('../models/MemberProfile');

const GOAL_MAP = {
  weight_loss: 'weight_loss',
  muscle_gain: 'hypertrophy',
  strength: 'strength',
  endurance: 'endurance',
  flexibility: 'general_fitness',
  general_fitness: 'general_fitness'
};

const DIFF_ORDER = { beginner: 0, intermediate: 1, advanced: 2 };

async function buildMemberContext(memberId) {
  const now = new Date();
  const thirtyAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [attCount, att30, logs30, completed30, lastAtt, measurements, profile, latestGoal] = await Promise.all([
    Attendance.countDocuments({ user: memberId }),
    Attendance.countDocuments({ user: memberId, date: { $gte: thirtyAgo } }),
    WorkoutLog.countDocuments({ user: memberId, date: { $gte: thirtyAgo } }),
    WorkoutLog.countDocuments({ user: memberId, date: { $gte: thirtyAgo }, isCompleted: true }),
    Attendance.findOne({ user: memberId }).sort({ date: -1 }),
    BodyMeasurement.find({ user: memberId }).sort({ date: -1 }).limit(5),
    MemberProfile.findOne({ user: memberId }),
    FitnessGoal.findOne({ user: memberId, status: 'ACTIVE' }).sort({ createdAt: -1 })
  ]);

  const attendancePct = (att30 / 30) * 100;
  const daysSinceVisit = lastAtt ? Math.floor((now - lastAtt.date) / (1000 * 60 * 60 * 24)) : 999;

  let weightChange = 0;
  if (measurements.length >= 2) {
    const sorted = [...measurements].reverse();
    const first = sorted[0].weight || 0;
    const last = sorted[sorted.length - 1].weight || 0;
    weightChange = last - first;
  }

  const segment = null;
  const risk = null;

  const goalType = latestGoal ? latestGoal.type : (profile?.medicalConditions ? 'general_fitness' : 'general_fitness');
  const primaryGoal = GOAL_MAP[goalType] || 'general_fitness';

  let difficulty = 'beginner';
  if (attendancePct >= 50 && daysSinceVisit <= 3) difficulty = 'intermediate';
  if ((attendancePct >= 75 && daysSinceVisit <= 1) || (attendancePct >= 50 && (measurements.length + logs30) > 8)) difficulty = 'advanced';

  return {
    memberId,
    attendancePct,
    att30,
    daysSinceVisit,
    workoutCompletion: logs30 > 0 ? (completed30 / logs30) * 100 : 0,
    weightChange,
    primaryGoal,
    difficulty,
    segment: segment?.prediction || null,
    riskLevel: risk?.riskLevel || null,
    isNewMember: !profile || !profile.joinDate || (now - profile.joinDate) < 30 * 24 * 60 * 60 * 1000
  };
}

function scoreTemplate(tpl, ctx) {
  let score = 0;
  const reasons = [];

  if (tpl.goal === ctx.primaryGoal) {
    score += 10;
    reasons.push(`Matched to your primary goal (${tpl.goal.replace('_', ' ')})`);
  } else if (tpl.goal === 'general_fitness') {
    score += 6;
    reasons.push('Good all-round general fitness option');
  } else {
    score += 2;
  }

  const diff = DIFF_ORDER[tpl.difficulty];
  const ctxDiff = DIFF_ORDER[ctx.difficulty];
  const gap = Math.abs(diff - ctxDiff);
  if (gap === 0) {
    score += 7;
    reasons.push(`Appropriate difficulty level (${tpl.difficulty})`);
  } else if (gap === 1) {
    score += 3;
    reasons.push(`Close to your fitness level (${tpl.difficulty})`);
  }

  if (tpl.difficulty === 'beginner' && (ctx.attendancePct < 20 || ctx.isNewMember)) {
    score += 3;
    reasons.push('Gentle start recommended while you build a routine');
  }

  if (ctx.weightChange > 0 && tpl.goal === 'weight_loss') {
    score += 3;
    reasons.push('Encourages continued weight progress');
  }
  if (ctx.riskLevel === 'HIGH') {
    score += 2;
    reasons.push('Focused engagement recommended based on activity risk');
  }

  score += Math.min(tpl.timesAssigned || 0, 20) * 0.25;
  if ((tpl.timesAssigned || 0) > 5) reasons.push(`Popular with other members (assigned ${tpl.timesAssigned}×)`);

  if (tpl.isShared) score += 3;

  return { score, reasons };
}

async function getWorkoutRecommendations(memberId, limit = 5) {
  const ctx = await buildMemberContext(memberId);
  const templates = await WorkoutTemplate.find({ isActive: true })
    .populate('createdBy', 'name')
    .populate('exercises.exercise', 'name category')
    .lean();

  const scored = templates
    .map((tpl) => {
      const { score, reasons } = scoreTemplate(tpl, ctx);
      return { score: Math.round(score * 100) / 100, tpl, reasons };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const maxScore = scored.length > 0 ? Math.max(...scored.map((s) => s.score)) : 0;

  const recommendations = scored.map(({ score, tpl, reasons }) => ({
    id: tpl._id,
    name: tpl.name,
    description: tpl.description,
    goal: tpl.goal,
    difficulty: tpl.difficulty,
    dayOfWeek: tpl.dayOfWeek,
    exerciseCount: tpl.exercises.length,
    createdBy: tpl.createdBy?.name || 'FitSync',
    timesAssigned: tpl.timesAssigned || 0,
    score: maxScore > 0 ? Math.min(100, Math.round((score / maxScore) * 100)) : 0,
    reasons: reasons.slice(0, 3)
  }));

  return { recommendations, context: ctx };
}

module.exports = { getWorkoutRecommendations, buildMemberContext };