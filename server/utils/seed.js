const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

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
const FoodItem = require('../models/FoodItem');
const MealPlan = require('../models/MealPlan');
const NutritionLog = require('../models/NutritionLog');
const WorkoutTemplate = require('../models/WorkoutTemplate');
const Announcement = require('../models/Announcement');
const GymSetting = require('../models/GymSetting');

const DAYS_AGO = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const MONTHS_AGO = (n) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  return d;
};

const seedDatabase = async () => {
  let connection;
  try {
    connection = await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const existingUserCount = await User.countDocuments();
    if (existingUserCount > 0) {
      console.log(`Database already has ${existingUserCount} users. Running idempotent seed (no data will be destroyed).\n`);
    }

    // ============================================================
    // ADMINS
    // ============================================================
    const adminData = [
      { name: 'Admin User', email: 'admin@fitsync.ai', password: 'Admin@123' },
      { name: 'Sarah Mitchell', email: 'sarah@fitsync.ai', password: 'Admin@123' },
    ];

    const admins = [];
    for (const a of adminData) {
      let user = await User.findOne({ email: a.email });
      if (user) {
        user.name = a.name;
        await user.save();
      } else {
        user = await User.create({ name: a.name, email: a.email, password: a.password, role: 'admin' });
      }
      admins.push(user);
    }
    console.log(`Admins: ${admins.length} ready`);

    // ============================================================
    // TRAINERS
    // ============================================================
    const trainerData = [
      {
        name: 'Alex Trainer', email: 'trainer@fitsync.ai', password: 'Trainer@123',
        specs: ['strength', 'cardio', 'HIIT'], exp: 8, bio: 'Certified personal trainer specializing in strength and conditioning. 8 years of experience helping clients reach their fitness goals.',
        phone: '+919800000001'
      },
      {
        name: 'Rajesh Kumar', email: 'rajesh@fitsync.ai', password: 'Trainer@123',
        specs: ['strength', 'bodybuilding'], exp: 10, bio: 'Former competitive bodybuilder and nutrition expert with a decade of coaching experience.',
        phone: '+919800000002'
      },
      {
        name: 'Priya Sharma', email: 'priya@fitsync.ai', password: 'Trainer@123',
        specs: ['yoga', 'flexibility', 'pilates'], exp: 6, bio: 'Yoga instructor and flexibility specialist. Passionate about holistic wellness and mindful movement.',
        phone: '+919800000003'
      },
      {
        name: 'Vikram Singh', email: 'vikram@fitsync.ai', password: 'Trainer@123',
        specs: ['cardio', 'endurance', 'crossfit'], exp: 7, bio: 'Endurance athlete and CrossFit L2 trainer. Specializes in high-intensity functional training.',
        phone: '+919800000004'
      },
      {
        name: 'Ananya Reddy', email: 'ananya@fitsync.ai', password: 'Trainer@123',
        specs: ['weight_loss', 'nutrition', 'group_fitness'], exp: 5, bio: 'Certified nutritionist and group fitness instructor focused on sustainable weight management.',
        phone: '+919800000005'
      },
    ];

    const trainers = [];
    for (const t of trainerData) {
      let user = await User.findOne({ email: t.email });
      if (user) {
        user.name = t.name;
        await user.save();
      } else {
        user = await User.create({ name: t.name, email: t.email, password: t.password, role: 'trainer' });
      }
      await TrainerProfile.findOneAndUpdate(
        { user: user._id },
        { specializations: t.specs, experience: t.exp, bio: t.bio, maxMembers: 20, phone: t.phone },
        { upsert: true, new: true }
      );
      trainers.push(user);
    }
    console.log(`Trainers: ${trainers.length} ready`);

    // ============================================================
    // MEMBERS
    // ============================================================
    const memberData = [
      { name: 'Dev Member', email: 'member@fitsync.ai', password: 'Member@123', phone: '+919700000001', gender: 'male', dob: new Date(1995, 3, 15), trainerIdx: 0 },
      { name: 'Amit Patel', email: 'amit@fitsync.ai', password: 'Member@123', phone: '+919700000002', gender: 'male', dob: new Date(1992, 6, 20), trainerIdx: 0 },
      { name: 'Sneha Gupta', email: 'sneha@fitsync.ai', password: 'Member@123', phone: '+919700000003', gender: 'female', dob: new Date(1998, 1, 10), trainerIdx: 1 },
      { name: 'Rohit Verma', email: 'rohit@fitsync.ai', password: 'Member@123', phone: '+919700000004', gender: 'male', dob: new Date(1990, 9, 5), trainerIdx: 1 },
      { name: 'Neha Kapoor', email: 'neha@fitsync.ai', password: 'Member@123', phone: '+919700000005', gender: 'female', dob: new Date(1996, 4, 22), trainerIdx: 2 },
      { name: 'Sanjay Nair', email: 'sanjay@fitsync.ai', password: 'Member@123', phone: '+919700000006', gender: 'male', dob: new Date(1988, 11, 12), trainerIdx: 2 },
      { name: 'Pooja Joshi', email: 'pooja@fitsync.ai', password: 'Member@123', phone: '+919700000007', gender: 'female', dob: new Date(1994, 7, 8), trainerIdx: 3 },
      { name: 'Vishal Rao', email: 'vishal@fitsync.ai', password: 'Member@123', phone: '+919700000008', gender: 'male', dob: new Date(1991, 2, 18), trainerIdx: 3 },
      { name: 'Divya Menon', email: 'divya@fitsync.ai', password: 'Member@123', phone: '+919700000009', gender: 'female', dob: new Date(1997, 8, 25), trainerIdx: 4 },
      { name: 'Arjun Das', email: 'arjun@fitsync.ai', password: 'Member@123', phone: '+919700000010', gender: 'male', dob: new Date(1993, 5, 30), trainerIdx: 0 },
      { name: 'Meera Iyer', email: 'meera@fitsync.ai', password: 'Member@123', phone: '+919700000011', gender: 'female', dob: new Date(1999, 0, 14), trainerIdx: 1 },
      { name: 'Karan Malhotra', email: 'karan@fitsync.ai', password: 'Member@123', phone: '+919700000012', gender: 'male', dob: new Date(1987, 10, 3), trainerIdx: 2 },
      { name: 'Tanvi Desai', email: 'tanvi@fitsync.ai', password: 'Member@123', phone: '+919700000013', gender: 'female', dob: new Date(1995, 12, 27), trainerIdx: 3 },
    ];

    const members = [];
    for (let i = 0; i < memberData.length; i++) {
      const m = memberData[i];
      let user = await User.findOne({ email: m.email });
      if (user) {
        user.name = m.name;
        await user.save();
      } else {
        user = await User.create({ name: m.name, email: m.email, password: m.password, role: 'member' });
      }
      await MemberProfile.findOneAndUpdate(
        { user: user._id },
        {
          phone: m.phone,
          gender: m.gender,
          dateOfBirth: m.dob,
          assignedTrainer: trainers[m.trainerIdx]._id,
          joinDate: DAYS_AGO(365 - i * 20),
        },
        { upsert: true, new: true }
      );
      members.push(user);
    }
    console.log(`Members: ${members.length} ready`);

    // ============================================================
    // MEMBERSHIP PLANS
    // ============================================================
    const membershipPlanDefs = [
      { name: 'Basic', price: 999, duration: 30, description: 'Basic gym access', features: ['Gym Access', 'Locker Room'] },
      { name: 'Standard', price: 1999, duration: 30, description: 'Standard plan with trainer', features: ['Gym Access', 'Locker Room', '1 Trainer Session/week', 'Basic Diet Plan'] },
      { name: 'Premium', price: 3499, duration: 30, description: 'Premium with personal trainer', features: ['Gym Access', 'Locker Room', '3 Trainer Sessions/week', 'Custom Diet Plan', 'Sauna Access'] },
      { name: 'Annual Basic', price: 9999, duration: 365, description: 'Annual basic membership', features: ['Gym Access', 'Locker Room', 'Free T-shirt'] },
      { name: 'Annual Premium', price: 29999, duration: 365, description: 'Annual premium membership', features: ['All Premium Features', 'Guest Passes', 'Priority Booking'] },
    ];

    const plans = [];
    for (const pd of membershipPlanDefs) {
      let plan = await MembershipPlan.findOne({ name: pd.name });
      if (!plan) {
        plan = await MembershipPlan.create(pd);
      }
      plans.push(plan);
    }
    console.log(`Membership plans: ${plans.length} ready`);

    // ============================================================
    // MEMBERSHIPS + PAYMENTS
    // ============================================================
    let membershipCount = 0;
    let paymentCount = 0;
    for (let i = 0; i < members.length; i++) {
      const planIdx = i % plans.length;
      const plan = plans[planIdx];
      const startDaysAgo = 10 + i * 15;
      const startDate = DAYS_AGO(startDaysAgo);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + plan.duration);

      let status = 'ACTIVE';
      if (endDate < new Date()) status = 'EXPIRED';
      if (i >= members.length - 2) status = 'CANCELLED';

      let membership = await Membership.findOne({ user: members[i]._id, plan: plan._id });
      if (!membership) {
        membership = await Membership.create({ user: members[i]._id, plan: plan._id, startDate, endDate, status });
        membershipCount++;
      } else {
        membership.status = status;
        membership.startDate = startDate;
        membership.endDate = endDate;
        await membership.save();
      }

      let payment = await Payment.findOne({ user: members[i]._id, membership: membership._id });
      if (!payment) {
        await Payment.create({
          user: members[i]._id,
          membership: membership._id,
          amount: plan.price,
          method: ['cash', 'card', 'upi', 'card', 'upi'][i % 5],
          status: status === 'CANCELLED' ? 'REFUNDED' : 'COMPLETED',
          date: startDate,
          transactionId: `TXN-FS-${String(1000 + i).padStart(6, '0')}`,
        });
        paymentCount++;
      }
    }
    console.log(`Memberships: ${membershipCount} created, Payments: ${paymentCount} created`);

    // ============================================================
    // ATTENDANCE (90 days)
    // ============================================================
    let attendanceCount = 0;
    const attendanceSeeds = [0.7, 0.85, 0.6, 0.75, 0.45, 0.55, 0.3, 0.65, 0.8, 0.5, 0.25, 0.7, 0.6];
    for (let i = 0; i < members.length; i++) {
      const baseProb = attendanceSeeds[i % attendanceSeeds.length];
      const existingCount = await Attendance.countDocuments({ user: members[i]._id });
      if (existingCount > 30) continue;

      for (let d = 0; d < 90; d++) {
        const date = DAYS_AGO(d);
        const dayOfWeek = date.getDay();
        let prob = baseProb;
        if (dayOfWeek === 0) prob *= 0.3;
        if (dayOfWeek === 6) prob *= 0.6;

        if (Math.random() < prob) {
          const existing = await Attendance.findOne({ user: members[i]._id, date: { $gte: new Date(date.toDateString()), $lt: new Date(date.getTime() + 86400000) } });
          if (existing) continue;

          const hour = 6 + Math.floor(Math.random() * 16);
          const minute = Math.floor(Math.random() * 60);
          const checkIn = new Date(date);
          checkIn.setHours(hour, minute, 0, 0);
          const duration = 45 + Math.floor(Math.random() * 75);
          const checkOut = new Date(checkIn.getTime() + duration * 60000);

          await Attendance.create({ user: members[i]._id, date, checkInTime: checkIn, checkOutTime: checkOut, method: Math.random() > 0.2 ? 'manual' : 'qr', duration });
          attendanceCount++;
        }
      }
    }
    console.log(`Attendance: ${attendanceCount} records created`);

    // ============================================================
    // EXERCISES
    // ============================================================
    const exerciseDefs = [
      { name: 'Bench Press', category: 'strength', muscleGroup: 'chest', difficulty: 'intermediate', equipment: 'Barbell' },
      { name: 'Squats', category: 'strength', muscleGroup: 'legs', difficulty: 'intermediate', equipment: 'Barbell' },
      { name: 'Deadlift', category: 'strength', muscleGroup: 'back', difficulty: 'advanced', equipment: 'Barbell' },
      { name: 'Overhead Press', category: 'strength', muscleGroup: 'shoulders', difficulty: 'intermediate', equipment: 'Barbell' },
      { name: 'Pull-ups', category: 'strength', muscleGroup: 'back', difficulty: 'intermediate', equipment: 'Pull-up Bar' },
      { name: 'Bicep Curls', category: 'strength', muscleGroup: 'biceps', difficulty: 'beginner', equipment: 'Dumbbell' },
      { name: 'Tricep Dips', category: 'strength', muscleGroup: 'triceps', difficulty: 'intermediate', equipment: 'Parallel Bars' },
      { name: 'Leg Press', category: 'strength', muscleGroup: 'legs', difficulty: 'beginner', equipment: 'Machine' },
      { name: 'Lat Pulldown', category: 'strength', muscleGroup: 'back', difficulty: 'beginner', equipment: 'Cable Machine' },
      { name: 'Treadmill Running', category: 'cardio', muscleGroup: 'full_body', difficulty: 'beginner', equipment: 'Treadmill' },
      { name: 'Cycling', category: 'cardio', muscleGroup: 'legs', difficulty: 'beginner', equipment: 'Stationary Bike' },
      { name: 'Jump Rope', category: 'cardio', muscleGroup: 'full_body', difficulty: 'intermediate', equipment: 'Jump Rope' },
      { name: 'Plank', category: 'core', muscleGroup: 'core', difficulty: 'beginner', equipment: 'None' },
      { name: 'Russian Twists', category: 'core', muscleGroup: 'core', difficulty: 'intermediate', equipment: 'Medicine Ball' },
      { name: 'Lunges', category: 'strength', muscleGroup: 'legs', difficulty: 'beginner', equipment: 'Dumbbell' },
      { name: 'Dumbbell Row', category: 'strength', muscleGroup: 'back', difficulty: 'intermediate', equipment: 'Dumbbell' },
      { name: 'Calf Raises', category: 'strength', muscleGroup: 'calves', difficulty: 'beginner', equipment: 'Machine' },
      { name: 'Shoulder Fly', category: 'strength', muscleGroup: 'shoulders', difficulty: 'beginner', equipment: 'Dumbbell' },
      { name: 'Burpees', category: 'plyometric', muscleGroup: 'full_body', difficulty: 'intermediate', equipment: 'None' },
      { name: 'Stretching', category: 'flexibility', muscleGroup: 'full_body', difficulty: 'beginner', equipment: 'Mat' },
    ];

    const exercises = [];
    for (const ed of exerciseDefs) {
      let ex = await Exercise.findOne({ name: ed.name });
      if (!ex) {
        ex = await Exercise.create(ed);
      }
      exercises.push(ex);
    }
    console.log(`Exercises: ${exercises.length} ready`);

    // ============================================================
    // EQUIPMENT
    // ============================================================
    const equipmentDefs = [
      { name: 'Treadmill Pro X1', category: 'cardio', condition: 'good', status: 'available', purchaseDate: new Date('2023-01-15'), lastMaintenance: new Date('2025-01-15'), nextMaintenance: new Date('2025-07-15'), location: 'Cardio Zone' },
      { name: 'Leg Press Machine', category: 'machines', condition: 'excellent', status: 'available', purchaseDate: new Date('2023-03-20'), lastMaintenance: new Date('2025-02-20'), nextMaintenance: new Date('2025-08-20'), location: 'Strength Area' },
      { name: 'Cable Crossover', category: 'machines', condition: 'good', status: 'in_use', purchaseDate: new Date('2022-06-10'), lastMaintenance: new Date('2025-01-10'), nextMaintenance: new Date('2025-07-10'), location: 'Strength Area' },
      { name: 'Olympic Barbell Set', category: 'free_weights', condition: 'fair', status: 'available', purchaseDate: new Date('2022-01-01'), lastMaintenance: new Date('2024-12-01'), nextMaintenance: new Date('2025-06-01'), location: 'Free Weight Zone' },
      { name: 'Adjustable Dumbbells', category: 'free_weights', condition: 'good', status: 'available', purchaseDate: new Date('2023-06-15'), lastMaintenance: new Date('2025-03-15'), nextMaintenance: new Date('2025-09-15'), location: 'Free Weight Zone' },
      { name: 'Stationary Bike', category: 'cardio', condition: 'needs_repair', status: 'under_maintenance', purchaseDate: new Date('2022-08-20'), lastMaintenance: new Date('2024-08-20'), nextMaintenance: new Date('2025-02-20'), location: 'Cardio Zone' },
      { name: 'Rowing Machine', category: 'cardio', condition: 'good', status: 'available', purchaseDate: new Date('2023-02-10'), lastMaintenance: new Date('2025-02-10'), nextMaintenance: new Date('2025-08-10'), location: 'Cardio Zone' },
      { name: 'Smith Machine', category: 'machines', condition: 'excellent', status: 'available', purchaseDate: new Date('2023-09-01'), lastMaintenance: new Date('2025-03-01'), nextMaintenance: new Date('2025-09-01'), location: 'Strength Area' },
      { name: 'Yoga Mats (20)', category: 'accessories', condition: 'fair', status: 'available', purchaseDate: new Date('2023-01-01'), location: 'Studio' },
      { name: 'Resistance Bands Set', category: 'accessories', condition: 'good', status: 'available', purchaseDate: new Date('2023-11-15'), location: 'Functional Area' },
    ];

    let equipmentCount = 0;
    for (const ed of equipmentDefs) {
      let eq = await Equipment.findOne({ name: ed.name });
      if (!eq) {
        await Equipment.create(ed);
        equipmentCount++;
      } else {
        eq.status = ed.status || 'available';
        await eq.save();
      }
    }
    console.log(`Equipment: ${equipmentCount} created`);

    // ============================================================
    // WORKOUT PLANS (trainer -> member with exercises)
    // ============================================================
    const workoutPlanDefs = [
      { trainerIdx: 0, memberIdx: 0, name: 'Strength Foundation', desc: 'Full body strength program for building a solid base', exercises: [0, 1, 2, 14], days: ['monday', 'wednesday', 'friday'] },
      { trainerIdx: 0, memberIdx: 1, name: 'Upper Body Power', desc: 'Focus on chest, back, and shoulders', exercises: [0, 4, 3, 15], days: ['monday', 'thursday'] },
      { trainerIdx: 0, memberIdx: 9, name: 'Athletic Performance', desc: 'Mixed strength and cardio for athletic conditioning', exercises: [1, 2, 11, 18], days: ['tuesday', 'thursday', 'saturday'] },
      { trainerIdx: 1, memberIdx: 2, name: 'Lean Muscle Builder', desc: 'High volume hypertrophy program', exercises: [5, 6, 16, 17], days: ['monday', 'wednesday', 'friday'] },
      { trainerIdx: 1, memberIdx: 3, name: 'Strength & Size', desc: 'Progressive overload focused program', exercises: [0, 1, 4, 5], days: ['tuesday', 'thursday', 'saturday'] },
      { trainerIdx: 1, memberIdx: 10, name: 'Beginner Full Body', desc: 'Introduction to weight training', exercises: [7, 8, 14, 19], days: ['monday', 'wednesday', 'friday'] },
      { trainerIdx: 2, memberIdx: 4, name: 'Yoga & Flexibility', desc: 'Flexibility and core stability program', exercises: [12, 13, 19, 11], days: ['monday', 'wednesday', 'friday'] },
      { trainerIdx: 2, memberIdx: 5, name: 'Core Strength', desc: 'Core-focused training for stability', exercises: [12, 13, 2, 7], days: ['tuesday', 'thursday', 'saturday'] },
      { trainerIdx: 2, memberIdx: 11, name: 'Functional Fitness', desc: 'Daily movement patterns and mobility', exercises: [12, 14, 19, 8], days: ['monday', 'wednesday', 'friday'] },
      { trainerIdx: 3, memberIdx: 6, name: 'Cardio Endurance', desc: 'Building cardiovascular endurance', exercises: [9, 10, 11, 18], days: ['monday', 'tuesday', 'thursday', 'friday'] },
      { trainerIdx: 3, memberIdx: 7, name: 'HIIT Blast', desc: 'High intensity interval training program', exercises: [18, 11, 9, 12], days: ['monday', 'wednesday', 'friday'] },
      { trainerIdx: 3, memberIdx: 12, name: 'Fat Loss Circuit', desc: 'Circuit training for maximum calorie burn', exercises: [18, 1, 9, 11], days: ['tuesday', 'thursday', 'saturday'] },
      { trainerIdx: 4, memberIdx: 8, name: 'Weight Management', desc: 'Combined nutrition and exercise for weight loss', exercises: [9, 10, 7, 14], days: ['monday', 'wednesday', 'friday'] },
      { trainerIdx: 4, memberIdx: 0, name: 'Cardio Mix', desc: 'Supplementary cardio sessions', exercises: [9, 10, 11], days: ['tuesday', 'saturday'] },
    ];

    let workoutPlanCount = 0;
    for (const wpd of workoutPlanDefs) {
      let plan = await WorkoutPlan.findOne({ name: wpd.name, member: members[wpd.memberIdx]._id });
      if (!plan) {
        await WorkoutPlan.create({
          trainer: trainers[wpd.trainerIdx]._id,
          member: members[wpd.memberIdx]._id,
          name: wpd.name,
          description: wpd.desc,
          exercises: wpd.exercises.map((ei) => ({ exercise: exercises[ei]._id, sets: 3, reps: 10, restTime: 60 })),
          startDate: DAYS_AGO(60),
          endDate: DAYS_AGO(-30),
          isActive: true,
          dayOfWeek: wpd.days,
        });
        workoutPlanCount++;
      }
    }
    console.log(`Workout plans: ${workoutPlanCount} created`);

    // ============================================================
    // WORKOUT LOGS (90 days of training data)
    // ============================================================
    const existingLogCount = await WorkoutLog.countDocuments();
    if (existingLogCount < 100) {
      let logCount = 0;
      const logPerformance = [0.85, 0.7, 0.65, 0.75, 0.4, 0.5, 0.3, 0.6, 0.8, 0.45, 0.2, 0.55, 0.7];
      for (let i = 0; i < members.length; i++) {
        const prob = logPerformance[i % logPerformance.length];
        for (let d = 0; d < 90; d++) {
          const date = DAYS_AGO(d);
          const dayOfWeek = date.getDay();
          let p = prob;
          if (dayOfWeek === 0) p *= 0.2;
          if (dayOfWeek === 6) p *= 0.5;

          if (Math.random() < p) {
            const numExercises = 2 + Math.floor(Math.random() * 4);
            const existingLogsForDate = await WorkoutLog.countDocuments({ user: members[i]._id, date: { $gte: new Date(date.toDateString()), $lt: new Date(date.getTime() + 86400000) } });
            if (existingLogsForDate > 0) continue;

            for (let e = 0; e < numExercises; e++) {
              const exIdx = Math.floor(Math.random() * exercises.length);
              const baseW = prob > 0.6 ? 35 + Math.random() * 25 : 15 + Math.random() * 20;
              await WorkoutLog.create({
                user: members[i]._id,
                exercise: exercises[exIdx]._id,
                date,
                sets: 2 + Math.floor(Math.random() * 4),
                reps: 6 + Math.floor(Math.random() * 10),
                weight: parseFloat(baseW.toFixed(1)),
                duration: 30 + Math.floor(Math.random() * 60),
                isCompleted: Math.random() > (prob < 0.4 ? 0.3 : 0.1),
              });
              logCount++;
            }
          }
        }
      }
      console.log(`Workout logs: ${logCount} created`);
    } else {
      console.log(`Workout logs: ${existingLogCount} already exist, skipping`);
    }

    // ============================================================
    // BODY MEASUREMENTS (12 months per member)
    // ============================================================
    const existingMeasCount = await BodyMeasurement.countDocuments();
    if (existingMeasCount < 50) {
      let measCount = 0;
      const measPerformance = [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 2];
      for (let i = 0; i < members.length; i++) {
        const perf = measPerformance[i % measPerformance.length];
        const baseWeight = 55 + (i * 3) % 40;
        const baseHeight = 155 + (i * 7) % 30;

        for (let m = 11; m >= 0; m--) {
          const date = MONTHS_AGO(m);
          date.setDate(15);

          const existing = await BodyMeasurement.findOne({ user: members[i]._id, date: { $gte: new Date(date.toDateString()), $lt: new Date(date.getTime() + 86400000 * 2) } });
          if (existing) continue;

          let weightChange = 0;
          if (perf === 0) weightChange = -0.5 * (12 - m);
          else if (perf === 2) weightChange = 0.3 * (12 - m);

          const weight = Math.max(45, Math.min(120, baseWeight + weightChange + (Math.random() - 0.5) * 2));
          const bodyFat = Math.max(8, Math.min(40, 22 + (perf === 0 ? -m * 0.5 : perf === 2 ? m * 0.3 : 0) + (Math.random() - 0.5) * 3));

          await BodyMeasurement.create({
            user: members[i]._id,
            date,
            weight: parseFloat(weight.toFixed(1)),
            height: baseHeight,
            bodyFat: parseFloat(bodyFat.toFixed(1)),
            chest: parseFloat((90 + weightChange * 0.3 + (Math.random() - 0.5) * 3).toFixed(1)),
            waist: parseFloat((80 - weightChange * 0.2 + (Math.random() - 0.5) * 4).toFixed(1)),
            hips: parseFloat((95 + (Math.random() - 0.5) * 4).toFixed(1)),
            biceps: parseFloat((30 + (perf === 0 ? m * 0.2 : 0) + (Math.random() - 0.5) * 2).toFixed(1)),
            thighs: parseFloat((55 + (Math.random() - 0.5) * 4).toFixed(1)),
          });
          measCount++;
        }
      }
      console.log(`Body measurements: ${measCount} created`);
    } else {
      console.log(`Body measurements: ${existingMeasCount} already exist, skipping`);
    }

    // ============================================================
    // FITNESS GOALS (one per member)
    // ============================================================
    const goalTypes = ['weight_loss', 'muscle_gain', 'strength', 'endurance', 'flexibility', 'general_fitness'];
    const goalTitles = {
      weight_loss: 'Lose 5kg in 3 months',
      muscle_gain: 'Build lean muscle mass',
      strength: 'Increase bench press to 80kg',
      endurance: 'Run 5K under 25 minutes',
      flexibility: 'Touch toes comfortably',
      general_fitness: 'Improve overall fitness level',
    };
    const goalUnits = { weight_loss: 'kg', muscle_gain: 'kg', strength: 'kg', endurance: 'minutes', flexibility: 'sessions', general_fitness: 'sessions' };

    let goalCount = 0;
    for (let i = 0; i < members.length; i++) {
      const goalType = goalTypes[i % goalTypes.length];
      const existing = await FitnessGoal.findOne({ user: members[i]._id, type: goalType });
      if (existing) continue;

      const target = goalType === 'weight_loss' ? 65 : goalType === 'endurance' ? 25 : goalType === 'strength' ? 80 : goalType === 'flexibility' ? 60 : 50;
      const current = goalType === 'weight_loss' ? 70 : goalType === 'endurance' ? 32 : goalType === 'strength' ? 55 : goalType === 'flexibility' ? 35 : 25;
      const status = current >= target ? 'COMPLETED' : 'ACTIVE';

      await FitnessGoal.create({
        user: members[i]._id,
        type: goalType,
        title: goalTitles[goalType],
        description: `Personal fitness goal: ${goalType.replace(/_/g, ' ')}`,
        target,
        current,
        unit: goalUnits[goalType],
        startDate: DAYS_AGO(180),
        targetDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        status,
      });
      goalCount++;
    }
    console.log(`Fitness goals: ${goalCount} created`);

    // ============================================================
    // NOTIFICATIONS
    // ============================================================
    const existingNotifCount = await Notification.countDocuments();
    if (existingNotifCount === 0) {
      const notifDefs = [];
      for (let i = 0; i < members.length; i++) {
        notifDefs.push(
          { user: members[i]._id, title: 'Welcome to FitSync AI!', message: 'Your account has been set up. Start by logging your first workout.', type: 'general', createdAt: DAYS_AGO(30) },
          { user: members[i]._id, title: 'Workout Reminder', message: "Don't forget to log today's workout to stay on track!", type: 'workout_reminder', createdAt: DAYS_AGO(5) },
        );
      }
      for (const admin of admins) {
        notifDefs.push(
          { user: admin._id, title: 'New Members Joined', message: `${members.length} members are currently active in the system.`, type: 'general', createdAt: DAYS_AGO(3) },
          { user: admin._id, title: 'Monthly Revenue Report', message: 'Your monthly revenue report is ready to view.', type: 'general', createdAt: DAYS_AGO(1) },
        );
      }
      for (const trainer of trainers) {
        notifDefs.push(
          { user: trainer._id, title: 'New Member Assigned', message: 'A new member has been assigned to your training roster.', type: 'general', createdAt: DAYS_AGO(7) },
          { user: trainer._id, title: 'Training Schedule Updated', message: 'Your weekly training schedule has been updated.', type: 'workout_reminder', createdAt: DAYS_AGO(2) },
        );
      }
      await Notification.insertMany(notifDefs);
      console.log(`Notifications: ${notifDefs.length} created`);
    } else {
      console.log(`Notifications: ${existingNotifCount} already exist, skipping`);
    }

    // ============================================================
    // FOOD DATABASE + MEAL PLANS + NUTRITION LOGS
    // ============================================================
    const foodDefs = [
      { name: 'Oats', category: 'grains', servingSize: 100, servingUnit: 'g', calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9 },
      { name: 'Brown Rice', category: 'grains', servingSize: 100, servingUnit: 'g', calories: 123, protein: 2.7, carbs: 25.2, fat: 1.0 },
      { name: 'Chicken Breast', category: 'protein', servingSize: 100, servingUnit: 'g', calories: 165, protein: 31.0, carbs: 0, fat: 3.6 },
      { name: 'Egg', category: 'protein', servingSize: 1, servingUnit: 'piece', calories: 78, protein: 6.3, carbs: 0.6, fat: 5.3 },
      { name: 'Banana', category: 'fruit', servingSize: 1, servingUnit: 'piece', calories: 105, protein: 1.3, carbs: 27.0, fat: 0.4 },
      { name: 'Apple', category: 'fruit', servingSize: 1, servingUnit: 'piece', calories: 95, protein: 0.5, carbs: 25.0, fat: 0.3 },
      { name: 'Greek Yogurt', category: 'dairy', servingSize: 100, servingUnit: 'g', calories: 59, protein: 10.0, carbs: 3.6, fat: 0.4 },
      { name: 'Milk', category: 'dairy', servingSize: 100, servingUnit: 'ml', calories: 42, protein: 3.4, carbs: 5.0, fat: 1.0 },
      { name: 'Broccoli', category: 'vegetable', servingSize: 100, servingUnit: 'g', calories: 34, protein: 2.8, carbs: 6.6, fat: 0.4 },
      { name: 'Spinach', category: 'vegetable', servingSize: 100, servingUnit: 'g', calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4 },
      { name: 'Peanut Butter', category: 'protein', servingSize: 1, servingUnit: 'tbsp', calories: 94, protein: 4.0, carbs: 3.1, fat: 8.1 },
      { name: 'Almonds', category: 'snack', servingSize: 1, servingUnit: 'handful', calories: 164, protein: 6.0, carbs: 6.1, fat: 14.2 },
      { name: 'Whey Protein', category: 'protein', servingSize: 1, servingUnit: 'scoop', calories: 120, protein: 24.0, carbs: 3.0, fat: 1.5 },
      { name: 'Whole Wheat Bread', category: 'grains', servingSize: 1, servingUnit: 'slice', calories: 80, protein: 4.0, carbs: 15.0, fat: 1.0 },
      { name: 'Sweet Potato', category: 'vegetable', servingSize: 100, servingUnit: 'g', calories: 86, protein: 1.6, carbs: 20.1, fat: 0.1 },
      { name: 'Salmon', category: 'protein', servingSize: 100, servingUnit: 'g', calories: 208, protein: 20.0, carbs: 0, fat: 13.0 },
      { name: 'Green Tea', category: 'beverage', servingSize: 1, servingUnit: 'cup', calories: 2, protein: 0, carbs: 0, fat: 0 },
      { name: 'Coconut Water', category: 'beverage', servingSize: 250, servingUnit: 'ml', calories: 45, protein: 0, carbs: 11.0, fat: 0 },
      { name: 'Hummus', category: 'snack', servingSize: 100, servingUnit: 'g', calories: 166, protein: 7.9, carbs: 14.3, fat: 9.6 },
      { name: 'Quinoa', category: 'grains', servingSize: 100, servingUnit: 'g', calories: 120, protein: 4.4, carbs: 21.3, fat: 1.9 },
    ];

    let foodCount = 0;
    for (const fd of foodDefs) {
      let food = await FoodItem.findOne({ name: fd.name });
      if (!food) {
        await FoodItem.create(fd);
        foodCount++;
      }
    }
    console.log(`Food items: ${foodCount} created, ${foodDefs.length} total`);

    // Meal plans
    const mealPlanDefs = [
      {
        name: 'Muscle Gain 3000', createdByIdx: 1, assignedIdx: 2, desc: 'High calorie, high protein plan for lean muscle growth',
        meals: [
          { mealType: 'breakfast', items: [[0, 1], [13, 2], [6, 1]], notes: 'Oats with milk and whole wheat toast' },
          { mealType: 'lunch', items: [[1, 1.5], [2, 1.5], [8, 1]], notes: 'Rice, chicken and broccoli' },
          { mealType: 'snack', items: [[11, 1], [4, 1]], notes: 'Almonds and banana' },
          { mealType: 'dinner', items: [[2, 1.5], [15, 1], [14, 1]], notes: 'Chicken with salmon and sweet potato' },
        ]
      },
      {
        name: 'Fat Loss 1800', createdByIdx: 4, assignedIdx: 8, desc: 'Balanced deficit plan with high protein for fat loss',
        meals: [
          { mealType: 'breakfast', items: [[0, 0.5], [7, 1], [4, 1]], notes: 'Light oats with milk and banana' },
          { mealType: 'lunch', items: [[1, 0.75], [2, 1], [9, 1]], notes: 'Small rice portion with chicken and spinach' },
          { mealType: 'snack', items: [[6, 1], [3, 1]], notes: 'Greek yogurt and boiled egg' },
          { mealType: 'dinner', items: [[15, 0.75], [8, 1]], notes: 'Salmon with broccoli' },
        ]
      },
      {
        name: 'Endurance Fuel', createdByIdx: 3, assignedIdx: 6, desc: 'Carb-focused plan for cardio athletes',
        meals: [
          { mealType: 'breakfast', items: [[19, 1], [4, 1]], notes: 'Quinoa porridge with banana' },
          { mealType: 'lunch', items: [[1, 1.5], [2, 1], [8, 1]], notes: 'Rice, chicken and broccoli' },
          { mealType: 'snack', items: [[17, 1], [13, 1]], notes: 'Coconut water with toast' },
          { mealType: 'dinner', items: [[14, 2], [2, 0.75], [9, 1]], notes: 'Sweet potato, chicken and spinach' },
        ]
      },
    ];

    const existingPlans = await MealPlan.countDocuments();
    if (existingPlans === 0) {
      for (const pd of mealPlanDefs) {
        const meals = [];
        for (const meal of pd.meals) {
          const items = meal.items.map(async ([foodIdx, qty]) => ({
              food: (await FoodItem.findOne({ name: foodDefs[foodIdx].name }))._id,
              quantity: qty
            }));
            const resolvedItems = await Promise.all(items);
          meals.push({ mealType: meal.mealType, items: resolvedItems, notes: meal.notes });
        }
        const plan = await MealPlan.create({
          name: pd.name,
          description: pd.desc,
          createdBy: trainers[pd.createdByIdx]._id,
          assignedTo: members[pd.assignedIdx]._id,
          meals,
          startDate: DAYS_AGO(30),
          endDate: DAYS_AGO(-30),
          isActive: true
        });
        const populated = await MealPlan.populate(plan, { path: 'meals.items.food', select: 'calories protein carbs fat' });
        let c = 0, p = 0, ca = 0, f = 0;
        for (const meal of populated.meals) {
          for (const item of meal.items) {
            c += (item.food.calories || 0) * item.quantity;
            p += (item.food.protein || 0) * item.quantity;
            ca += (item.food.carbs || 0) * item.quantity;
            f += (item.food.fat || 0) * item.quantity;
          }
        }
        plan.dailyCalories = Math.round(c);
        plan.dailyProtein = Math.round(p);
        plan.dailyCarbs = Math.round(ca);
        plan.dailyFat = Math.round(f);
        await plan.save();
      }
      console.log(`Meal plans: ${mealPlanDefs.length} created`);
    } else {
      console.log(`Meal plans: ${existingPlans} already exist, skipping`);
    }

    // Nutrition logs (recent days for members)
    const existingNutritionLogCount = await NutritionLog.countDocuments();
    if (existingNutritionLogCount < 30) {
      let logCount = 0;
      for (const member of members) {
        for (let d = 0; d < 7; d++) {
          if (Math.random() < 0.6) {
            const date = new Date(DAYS_AGO(d));
            const log = await NutritionLog.create({ user: member._id, date, waterGlasses: 4 + Math.floor(Math.random() * 6) });
            const numEntries = 2 + Math.floor(Math.random() * 3);
            const entries = await FoodItem.find({});
            for (let e = 0; e < numEntries; e++) {
              log.meals.push({
                mealType: ['breakfast', 'lunch', 'snack', 'dinner'][Math.floor(Math.random() * 4)],
                food: entries[Math.floor(Math.random() * entries.length)]._id,
                quantity: 0.5 + Math.random() * 1.5
              });
            }
            const populated = await NutritionLog.populate(log, { path: 'meals.food', select: 'calories protein carbs fat' });
            for (const meal of populated.meals) {
              for (const item of meal.items) {
                log.totalCalories += (item.food.calories || 0) * item.quantity;
                log.totalProtein += (item.food.protein || 0) * item.quantity;
              }
            }
            await log.save();
            logCount++;
          }
        }
      }
      console.log(`Nutrition logs: ${logCount} created`);
    } else {
      console.log(`Nutrition logs: ${existingNutritionLogCount} already exist, skipping`);
    }

    // ============================================================
    // GYM SETTINGS
    // ============================================================
    let gymSetting = await GymSetting.findOne();
    if (!gymSetting) {
      await GymSetting.create({
        name: 'FitSync AI Gym',
        address: '123 Fitness Street, Mumbai, Maharashtra 400001',
        phone: '+919800000000',
        email: 'info@fitsync.ai',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        operatingHours: 'Mon-Fri: 5:00 AM - 11:00 PM, Sat-Sun: 6:00 AM - 10:00 PM',
      });
      console.log('Gym settings: created');
    } else {
      console.log('Gym settings: already exist, skipping');
    }

    // ============================================================
    // WORKOUT TEMPLATES
    // ============================================================
    const templateCount = await WorkoutTemplate.countDocuments();
    if (templateCount === 0) {
      const templateDefs = [
        {
          name: 'Full Body Foundation', goal: 'general_fitness', difficulty: 'beginner',
          desc: 'A balanced introduction to all major movement patterns.',
          exercises: [7, 8, 14, 19, 10], days: ['monday', 'wednesday', 'friday']
        },
        {
          name: 'Upper Body Strength', goal: 'strength', difficulty: 'intermediate',
          desc: 'Progressive overload focused on chest, back and shoulders.',
          exercises: [0, 4, 3, 15, 5], days: ['monday', 'thursday']
        },
        {
          name: 'Leg Day Builder', goal: 'hypertrophy', difficulty: 'intermediate',
          desc: 'High volume leg training for size and strength.',
          exercises: [1, 7, 16, 14, 13], days: ['tuesday', 'saturday']
        },
        {
          name: 'Fat Burn Circuit', goal: 'weight_loss', difficulty: 'beginner',
          desc: 'Combined strength and cardio circuit for maximum calorie burn.',
          exercises: [18, 9, 11, 12, 19], days: ['monday', 'tuesday', 'thursday', 'friday']
        },
        {
          name: 'Endurance Engine', goal: 'endurance', difficulty: 'intermediate',
          desc: 'Cardio and conditioning to build stamina.',
          exercises: [9, 10, 11, 18, 19], days: ['monday', 'wednesday', 'friday']
        },
      ];

      let tCount = 0;
      for (const td of templateDefs) {
        const tplExercises = [];
        for (const ei of td.exercises) {
          tplExercises.push({ exercise: exercises[ei]._id, sets: 3, reps: 10 });
        }
        await WorkoutTemplate.create({
          name: td.name,
          description: td.desc,
          createdBy: trainers[0]._id,
          goal: td.goal,
          difficulty: td.difficulty,
          exercises: tplExercises,
          dayOfWeek: td.days,
          isShared: true
        });
        tCount++;
      }
      console.log(`Workout templates: ${tCount} created`);
    } else {
      console.log(`Workout templates: ${templateCount} already exist, skipping`);
    }

    // ============================================================
    // ANNOUNCEMENTS
    // ============================================================
    const annCount = await Announcement.countDocuments();
    if (annCount === 0) {
      const annDefs = [
        { title: 'Welcome to the New Season!', message: 'We have upgraded the gym with new equipment. Check out the new machines in the strength area!', priority: 'info', pinned: true },
        { title: 'Holiday Schedule Update', message: 'The gym will close early at 6 PM on national holidays this month.', priority: 'warning', pinned: false },
        { title: 'Annual Memberships Available', message: 'Grab our Annual Premium plan today and save big. Limited time offer!', priority: 'warning', pinned: false },
        { title: 'Maintenance Notice', message: 'The cardio zone will be under maintenance this Saturday from 9-11 AM.', priority: 'critical', pinned: false },
      ];
      for (const ad of annDefs) {
        await Announcement.create({ ...ad, createdBy: admins[0]._id });
      }
      console.log(`Announcements: ${annDefs.length} created`);
    } else {
      console.log(`Announcements: ${annCount} already exist, skipping`);
    }

    // ============================================================
    // SUMMARY
    // ============================================================
    const userCount = await User.countDocuments();
    const memberCount = await User.countDocuments({ role: 'member' });
    const trainerCount = await User.countDocuments({ role: 'trainer' });
    const adminCount = await User.countDocuments({ role: 'admin' });

    console.log('\n========================================');
    console.log('  SEED COMPLETE');
    console.log('========================================');
    console.log(`  Users: ${userCount} (${adminCount} admins, ${trainerCount} trainers, ${memberCount} members)`);
    console.log('----------------------------------------');
    console.log('  Admin Login:');
    console.log('    Email: admin@fitsync.ai');
    console.log('    Pass:  Admin@123');
    console.log('----------------------------------------');
    console.log('  Trainer Login:');
    console.log('    Email: trainer@fitsync.ai');
    console.log('    Pass:  Trainer@123');
    console.log('----------------------------------------');
    console.log('  Member Login:');
    console.log('    Email: member@fitsync.ai');
    console.log('    Pass:  Member@123');
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seedDatabase();
