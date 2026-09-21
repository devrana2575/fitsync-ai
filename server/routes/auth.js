'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const MemberProfile = require('../models/MemberProfile');
const TrainerProfile = require('../models/TrainerProfile');
const { generateToken } = require('../utils/helpers');
const { auth } = require('../middleware/auth');
const {
  WEEKDAYS,
  ACTIVITY_LEVELS,
  memberProfileCompletion,
  trainerProfileCompletion,
} = require('../utils/profileCompletion');

const PHONE_RE = /^[\+]?[\d\s\-\(\)]{7,15}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// --- Shared profile validators ----------------------------------------------

// Returns { value, error }. `value` is undefined when the input was empty.
const parseOptional = (v) => (v === undefined || v === null || v === '' ? undefined : v);

const validatePhoneNumbers = (phoneNumbers) => {
  if (phoneNumbers === undefined) return null;
  if (!Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
    return 'At least one phone number is required';
  }
  const seen = new Set();
  for (const entry of phoneNumbers) {
    const number = String(entry && entry.number || '').trim();
    if (!number) return 'Phone number is required';
    if (!PHONE_RE.test(number)) return 'Please provide a valid phone number';
    if (seen.has(number)) return 'Duplicate phone numbers are not allowed';
    seen.add(number);
  }
  return null;
};

const validateDateOfBirth = (v) => {
  const value = parseOptional(v);
  if (value === undefined) return { value: undefined, error: null };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { value: undefined, error: 'Please provide a valid date of birth' };
  if (date.getTime() > Date.now()) return { value: undefined, error: 'Date of birth cannot be in the future' };
  const age = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  if (age < 5 || age > 100) return { value: undefined, error: 'Please provide a realistic date of birth' };
  return { value: date, error: null };
};

const validateRange = (v, { key, min, max, unit, integer = false }) => {
  const value = parseOptional(v);
  if (value === undefined) return { value: undefined, error: null };
  const num = Number(value);
  if (integer && !Number.isInteger(num)) {
    return { value: undefined, error: `${key} must be a whole number` };
  }
  if (!Number.isFinite(num) || num < min || num > max) {
    return { value: undefined, error: `${key} must be between ${min} and ${max} ${unit}` };
  }
  return { value: num, error: null };
};

const validateEmergencyContact = (v) => {
  if (v === undefined || v === null || typeof v !== 'object') return { value: undefined, error: null };
  const name = String(v.name || '').trim();
  const phone = String(v.phone || '').trim();
  const relationship = String(v.relationship || '').trim();
  if (name && !PHONE_RE.test(phone) && phone) {
    return { value: undefined, error: 'Please provide a valid emergency contact phone' };
  }
  return { value: { name, phone, relationship }, error: null };
};

const validateCertifications = (v) => {
  if (v === undefined) return { value: undefined, error: null };
  if (!Array.isArray(v)) return { value: undefined, error: 'Certifications must be a list' };
  const list = v.map((c) => ({
    name: String(c && c.name || '').trim(),
    issuer: String(c && c.issuer || '').trim(),
    year: c && c.year !== undefined && c.year !== '' && c.year !== null ? Number(c.year) : undefined,
  }));
  if (list.some((c) => !c.name)) return { value: undefined, error: 'Each certification needs a name' };
  if (list.some((c) => c.year !== undefined && (!Number.isInteger(c.year) || c.year < 1950 || c.year > new Date().getFullYear() + 1))) {
    return { value: undefined, error: 'Certification year is invalid' };
  }
  return { value: list, error: null };
};

// --- Avatar upload (multer, same pattern as progress photos) ----------------

const avatarDir = path.join(__dirname, '..', 'uploads', 'avatars');
fs.mkdirSync(avatarDir, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `${req.user._id}-${Date.now()}${ext}`);
  }
});

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPEG, PNG, WebP or GIF images are allowed'));
  }
});

const uploadAvatarMiddleware = (req, res, next) => {
  avatarUpload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'Invalid image file' });
    next();
  });
};

// --- Routes -----------------------------------------------------------------

router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[A-Za-z])(?=.*\d).+$/).withMessage('Password must contain both letters and numbers')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { name, email, password, phone } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const user = await User.create({ name, email, password, role: 'member' });

    await MemberProfile.create({ user: user._id, phone });

    const token = generateToken(user._id);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated. Contact admin.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/change-password', [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/^(?=.*[A-Za-z])(?=.*\d).+$/).withMessage('New password must contain both letters and numbers')
], auth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await user.comparePassword(req.body.currentPassword);
    if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect' });

    if (req.body.currentPassword === req.body.newPassword) {
      return res.status(400).json({ message: 'New password must be different from the current password' });
    }

    user.password = req.body.newPassword;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    let profile = null;
    let completion = null;

    if (user.role === 'member') {
      profile = await MemberProfile.findOne({ user: user._id }).populate('assignedTrainer', 'name email');
      completion = memberProfileCompletion(user, profile);
    } else if (user.role === 'trainer') {
      profile = await TrainerProfile.findOne({ user: user._id });
      completion = trainerProfileCompletion(user, profile);
    }

    res.json({ user, profile, completion });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/me', auth, async (req, res) => {
  try {
    const {
      name, phone, phoneNumbers, address, emergencyContact,
      gender, dateOfBirth, heightCm, weightKg,
      goals, activityLevel, preferredWorkoutDays, preferredWorkoutDuration,
      medicalConditions, injuries, medicalNotes, allergies, medicalRestrictions,
      specializations, certifications, experience, bio, languages,
      workingDays, workingHours, maxMembers,
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name !== undefined) user.name = String(name).trim();

    let profile;

    if (user.role === 'member') {
      const phoneError = validatePhoneNumbers(phoneNumbers);
      if (phoneError) return res.status(400).json({ message: phoneError });

      const dod = validateDateOfBirth(dateOfBirth);
      if (dod.error) return res.status(400).json({ message: dod.error });
      const height = validateRange(heightCm, { key: 'Height', min: 40, max: 300, unit: 'cm' });
      if (height.error) return res.status(400).json({ message: height.error });
      const weight = validateRange(weightKg, { key: 'Weight', min: 2, max: 500, unit: 'kg' });
      if (weight.error) return res.status(400).json({ message: weight.error });
      const duration = validateRange(preferredWorkoutDuration, { key: 'Preferred workout duration', min: 15, max: 300, unit: 'minutes', integer: true });
      if (duration.error) return res.status(400).json({ message: duration.error });
      const emergency = validateEmergencyContact(emergencyContact);
      if (emergency.error) return res.status(400).json({ message: emergency.error });

      if (gender !== undefined && !['male', 'female', 'other'].includes(gender)) {
        return res.status(400).json({ message: 'Invalid gender' });
      }
      if (activityLevel !== undefined && !ACTIVITY_LEVELS.includes(activityLevel)) {
        return res.status(400).json({ message: 'Invalid activity level' });
      }
      if (preferredWorkoutDays !== undefined) {
        if (!Array.isArray(preferredWorkoutDays) || preferredWorkoutDays.some((d) => !WEEKDAYS.includes(d))) {
          return res.status(400).json({ message: 'Preferred workout days must be valid weekdays' });
        }
      }
      if (phone !== undefined && phone !== null && String(phone).trim() !== '' && !PHONE_RE.test(String(phone).trim())) {
        return res.status(400).json({ message: 'Please provide a valid phone number' });
      }

      const update = {
        phone, address, gender, dateOfBirth: dod.value, heightCm: height.value,
        weightKg: weight.value, goals, activityLevel,
        preferredWorkoutDays, preferredWorkoutDuration: duration.value,
        medicalConditions, injuries, medicalNotes, allergies, medicalRestrictions,
        emergencyContact: emergency.value,
      };
      for (const key of Object.keys(update)) {
        if (update[key] === undefined) delete update[key];
      }

      if (phoneNumbers !== undefined) {
        update.phoneNumbers = phoneNumbers;
        const primary = phoneNumbers.find((p) => p.label === 'Primary') || phoneNumbers[0];
        if (primary && primary.number) update.phone = String(primary.number).trim();
      }

      const set = Object.keys(update).length
        ? { $set: update, $setOnInsert: { user: user._id } }
        : { $setOnInsert: { user: user._id } };
      await MemberProfile.updateOne(
        { user: user._id },
        set,
        { upsert: true }
      );
      profile = await MemberProfile.findOne({ user: user._id });
    } else if (user.role === 'trainer') {
      const dod = validateDateOfBirth(dateOfBirth);
      if (dod.error) return res.status(400).json({ message: dod.error });
      const height = validateRange(heightCm, { key: 'Height', min: 40, max: 300, unit: 'cm' });
      if (height.error) return res.status(400).json({ message: height.error });
      const weight = validateRange(weightKg, { key: 'Weight', min: 2, max: 500, unit: 'kg' });
      if (weight.error) return res.status(400).json({ message: weight.error });
      const years = validateRange(experience, { key: 'Experience', min: 0, max: 80, unit: 'years', integer: true });
      if (years.error) return res.status(400).json({ message: years.error });
      const capacity = validateRange(maxMembers, { key: 'Max members', min: 1, max: 500, unit: 'members', integer: true });
      if (capacity.error) return res.status(400).json({ message: capacity.error });
      const certs = validateCertifications(certifications);
      if (certs.error) return res.status(400).json({ message: certs.error });

      if (phone !== undefined && phone !== null && String(phone).trim() !== '' && !PHONE_RE.test(String(phone).trim())) {
        return res.status(400).json({ message: 'Please provide a valid phone number' });
      }
      if (gender !== undefined && !['male', 'female', 'other'].includes(gender)) {
        return res.status(400).json({ message: 'Invalid gender' });
      }
      if (specializations !== undefined) {
        if (!Array.isArray(specializations) || specializations.some((s) => !String(s || '').trim())) {
          return res.status(400).json({ message: 'Specializations must be a list of non-empty values' });
        }
      }
      if (workingDays !== undefined) {
        if (!Array.isArray(workingDays) || workingDays.some((d) => !WEEKDAYS.includes(d))) {
          return res.status(400).json({ message: 'Working days must be valid weekdays' });
        }
      }
      if (languages !== undefined && (!Array.isArray(languages) || languages.some((l) => !String(l || '').trim()))) {
        return res.status(400).json({ message: 'Languages must be a list of non-empty values' });
      }
      if (workingHours !== undefined) {
        const start = String((workingHours && workingHours.start) || '').trim();
        const end = String((workingHours && workingHours.end) || '').trim();
        const cleaned = { start: start || undefined, end: end || undefined };
        if ((start && !TIME_RE.test(start)) || (end && !TIME_RE.test(end))) {
          return res.status(400).json({ message: 'Working hours must be valid 24h times (HH:MM)' });
        }
        if (start && end && start >= end) {
          return res.status(400).json({ message: 'Working hours end must be after start' });
        }
        if ((start && !end) || (!start && end)) {
          return res.status(400).json({ message: 'Both working hours start and end are required together' });
        }
        req.body.workingHours = cleaned;
      }

      const update = {
        phone, dateOfBirth: dod.value, gender, address,
        heightCm: height.value, weightKg: weight.value,
        specializations, certifications: certs.value, experience: years.value, bio, languages,
        workingDays, workingHours: req.body.workingHours,
        maxMembers: capacity.value,
      };
      for (const key of Object.keys(update)) {
        if (update[key] === undefined) delete update[key];
      }

      const set = Object.keys(update).length
        ? { $set: update, $setOnInsert: { user: user._id } }
        : { $setOnInsert: { user: user._id } };
      await TrainerProfile.updateOne(
        { user: user._id },
        set,
        { upsert: true }
      );
      profile = await TrainerProfile.findOne({ user: user._id });
    }

    await user.save();

    const completion =
      user.role === 'member' ? memberProfileCompletion(user, profile) :
      user.role === 'trainer' ? trainerProfileCompletion(user, profile) : null;

    res.json({ user, profile, completion });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Profile photo (upload / replace / remove). Reuses User.avatar and the
// existing static /uploads mount. auth is enforced; users can only change
// their own avatar.
router.post('/me/avatar', auth, uploadAvatarMiddleware, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Profile photo is required' });
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.avatar && user.avatar.startsWith('/uploads/avatars/')) {
      fs.unlink(path.join(avatarDir, path.basename(user.avatar)), () => {});
    }
    user.avatar = `/uploads/avatars/${req.file.filename}`;
    await user.save();
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/me/avatar', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.avatar) {
      if (user.avatar.startsWith('/uploads/avatars/')) {
        fs.unlink(path.join(avatarDir, path.basename(user.avatar)), () => {});
      }
      user.avatar = '';
      await user.save();
    }
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/preferences', auth, async (req, res) => {
  try {
    const { emailNotifications, smsNotifications, notifyTypes } = req.body;
    const update = {};
    if (emailNotifications !== undefined) update['preferences.emailNotifications'] = emailNotifications;
    if (smsNotifications !== undefined) update['preferences.smsNotifications'] = smsNotifications;
    if (Array.isArray(notifyTypes)) update['preferences.notifyTypes'] = notifyTypes;

    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true });
    res.json({ preferences: user.preferences });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;