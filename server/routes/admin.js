const express = require('express');
const { auth, authorize } = require('../middleware/auth');
const router = express.Router();

const User = require('../models/User');
const MemberProfile = require('../models/MemberProfile');
const TrainerProfile = require('../models/TrainerProfile');
const MembershipPlan = require('../models/MembershipPlan');
const Membership = require('../models/Membership');
const Payment = require('../models/Payment');
const Attendance = require('../models/Attendance');
const Exercise = require('../models/Exercise');
const Equipment = require('../models/Equipment');
const WorkoutPlan = require('../models/WorkoutPlan');
const WorkoutLog = require('../models/WorkoutLog');
const BodyMeasurement = require('../models/BodyMeasurement');
const FitnessGoal = require('../models/FitnessGoal');
const Notification = require('../models/Notification');
const DietLog = require('../models/DietLog');
const WorkoutTemplate = require('../models/WorkoutTemplate');
const Announcement = require('../models/Announcement');
const ProgressPhoto = require('../models/ProgressPhoto');
const GymSetting = require('../models/GymSetting');

const EDITABLE_FIELDS = {
  // role is deliberately not editable through AllData: authz decoupled from
  // data debugging.
  users: ['name', 'email', 'avatar', 'isActive', 'preferences'],
  // assignedTrainer / trainerAssignmentStatus / pendingTrainerReason are NOT
  // editable through AllData: trainer allocation flows through the allocation
  // service or the admin assign-trainer business route so status stays coherent.
  memberProfiles: ['phone', 'phoneNumbers', 'dateOfBirth', 'gender', 'address', 'emergencyContact', 'joinDate', 'medicalConditions', 'injuries', 'medicalNotes', 'allergies', 'medicalRestrictions', 'doctorRecommendation', 'trainerRecommendation', 'goals', 'activityLevel', 'preferredWorkoutDays', 'preferredWorkoutDuration', 'heightCm', 'weightKg'],
  trainerProfiles: ['phone', 'dateOfBirth', 'gender', 'address', 'heightCm', 'weightKg', 'specializations', 'certifications', 'experience', 'bio', 'languages', 'workingDays', 'workingHours', 'maxMembers', 'isAvailable', 'absenceReason', 'absenceFrom', 'absenceTo'],
  membershipPlans: ['name', 'price', 'duration', 'description', 'features', 'isActive', 'trainerIncluded', 'trainerAllocationMode', 'requiredSpecialization', 'workoutPlanIncluded', 'paymentMode', 'installments'],
  // status is not editable through AllData: activation must flow through the
  // payment-verified paths (or explicit admin flows in the memberships API).
  memberships: ['startDate', 'endDate', 'autoRenew'],
  // Payment records are a financial LEDGER, not debug rows. amount, status,
  // transactionId, date and every gateway/verification field must only change
  // through explicit validated business operations (POST/PUT/verify/refund in
  // the payments API, gateway webhooks). AllData may only annotate with notes,
  // so a stray edit can never silently rewrite money or completion state.
  payments: ['notes'],
  attendances: ['date', 'checkInTime', 'checkOutTime', 'method', 'duration'],
  exercises: ['name', 'category', 'muscleGroup', 'difficulty', 'description', 'equipment', 'isActive'],
  equipment: ['name', 'category', 'brand', 'model', 'condition', 'status', 'purchaseDate', 'lastMaintenance', 'nextMaintenance', 'location', 'isActive', 'description', 'notes', 'reportedIssue', 'reportedAt'],
  workoutPlans: ['name', 'description', 'startDate', 'endDate', 'isActive', 'dayOfWeek', 'exercises', 'goal', 'hoursPerDay', 'totalHours', 'recommendationSource'],
  workoutLogs: ['date', 'sets', 'reps', 'weight', 'duration', 'isCompleted', 'notes'],
  bodyMeasurements: ['date', 'weight', 'height', 'bodyFat', 'chest', 'waist', 'hips', 'biceps', 'thighs'],
  fitnessGoals: ['type', 'title', 'description', 'start', 'target', 'current', 'unit', 'startDate', 'targetDate', 'status'],
  notifications: ['title', 'message', 'type', 'isRead', 'link'],
  dietLogs: ['date', 'completedDiets'],
  workoutTemplates: ['name', 'description', 'goal', 'difficulty', 'dayOfWeek', 'exercises', 'isShared', 'isActive'],
  announcements: ['title', 'message', 'priority', 'pinned', 'expiresAt', 'isActive'],
  progressPhotos: ['url', 'caption', 'angle', 'date', 'isActive'],
  gymSettings: ['name', 'address', 'phone', 'email', 'currency', 'timezone', 'operatingHours'],
};

const COLLECTIONS = [
  { key: 'users', label: 'Users', model: User },
  { key: 'memberProfiles', label: 'Member Profiles', model: MemberProfile },
  { key: 'trainerProfiles', label: 'Trainer Profiles', model: TrainerProfile },
  { key: 'membershipPlans', label: 'Membership Plans', model: MembershipPlan },
  { key: 'memberships', label: 'Memberships', model: Membership },
  { key: 'payments', label: 'Payments', model: Payment },
  { key: 'attendances', label: 'Attendance', model: Attendance },
  { key: 'exercises', label: 'Exercises', model: Exercise },
  { key: 'equipment', label: 'Equipment', model: Equipment },
  { key: 'workoutPlans', label: 'Workout Plans', model: WorkoutPlan },
  { key: 'workoutLogs', label: 'Workout Logs', model: WorkoutLog },
  { key: 'bodyMeasurements', label: 'Body Measurements', model: BodyMeasurement },
  { key: 'fitnessGoals', label: 'Fitness Goals', model: FitnessGoal },
  { key: 'notifications', label: 'Notifications', model: Notification },
  { key: 'dietLogs', label: 'Diet Logs', model: DietLog },
  { key: 'workoutTemplates', label: 'Workout Templates', model: WorkoutTemplate },
  { key: 'announcements', label: 'Announcements', model: Announcement },
  { key: 'progressPhotos', label: 'Progress Photos', model: ProgressPhoto },
  { key: 'gymSettings', label: 'Gym Settings', model: GymSetting },
];

const MAX_ROWS = 100;

const getCollection = (key) => COLLECTIONS.find((c) => c.key === key);

// Referential-integrity guards for the AllData debug delete button. Parent
// records that other entities reference may not be physically deleted: doing
// so would create orphaned/broken relationships. Users and role profiles are
// never hard-deletable (deactivate instead); plans/memberships are deletable
// only while nothing references them. Leaf records delete freely.
const DELETE_GUARDS = {
  users: async () => 'Users cannot be deleted - deactivate them instead so all history stays intact',
  memberProfiles: async () => 'Member profiles cannot be deleted - the linked user must keep a profile (deactivate instead)',
  trainerProfiles: async () => 'Trainer profiles cannot be deleted - the linked user must keep a profile (deactivate instead)',
  membershipPlans: async (doc) => {
    const refs = await Membership.countDocuments({ plan: doc._id });
    return refs > 0 ? `Cannot delete: ${refs} membership record(s) reference this plan` : null;
  },
  memberships: async (doc) => {
    const refs = await Payment.countDocuments({ membership: doc._id });
    return refs > 0 ? `Cannot delete: ${refs} payment record(s) reference this membership` : null;
  },
  // Financial records are never physically deleted. Money movements must stay
  // reconstructible (ledger property); if a transaction was wrong it gets
  // refunded/annotated, not erased.
  payments: async () => 'Payment records are financial records and cannot be deleted - issue a refund or annotate instead',
};

router.get('/all', auth, authorize('admin'), async (req, res) => {
  try {
    const results = await Promise.all(
      COLLECTIONS.map(async ({ key, label, model }) => {
        const [count, rows] = await Promise.all([
          model.countDocuments(),
          model.find().sort({ _id: -1 }).limit(MAX_ROWS).lean(),
        ]);
        return { key, label, count, rows, editableFields: EDITABLE_FIELDS[key] || [] };
      })
    );
    res.json({ data: results });
  } catch (error) {
    console.error('[admin/all] Error:', error.message);
    res.status(500).json({ message: 'Failed to load all data' });
  }
});

router.put('/all/:collectionKey/:id', auth, authorize('admin'), async (req, res) => {
  const collection = getCollection(req.params.collectionKey);
  if (!collection) {
    return res.status(404).json({ message: 'Unknown collection' });
  }

  const doc = await collection.model.findById(req.params.id);
  if (!doc) {
    return res.status(404).json({ message: 'Record not found' });
  }

  const allowed = new Set(EDITABLE_FIELDS[collection.key] || []);
  const updates = req.body || {};
  for (const [key, value] of Object.entries(updates)) {
    if (!allowed.has(key)) continue;
    doc[key] = value;
  }

  await doc.save();
  const updated = await collection.model.findById(doc._id).lean();
  res.json({ message: `${collection.label}: record updated`, data: updated });
});

router.delete('/all/:collectionKey/:id', auth, authorize('admin'), async (req, res) => {
  const collection = getCollection(req.params.collectionKey);
  if (!collection) {
    return res.status(404).json({ message: 'Unknown collection' });
  }

  const doc = await collection.model.findById(req.params.id);
  if (!doc) {
    return res.status(404).json({ message: 'Record not found' });
  }

  const guard = DELETE_GUARDS[collection.key];
  if (guard) {
    const reason = await guard(doc);
    if (reason) {
      return res.status(400).json({ message: reason });
    }
  }

  await doc.deleteOne();
  res.json({ message: `${collection.label}: record deleted` });
});

module.exports = router;