'use strict';

// Deterministic "Complete Your Profile" scoring for members and trainers.
//
// Rules:
//  - Required fields are role-specific and deliberately conservative. A user
//    can reach 100% without entering optional or medical information.
//  - Optional sections are reported separately so the UI can encourage (but
//    never force) them.
//  - The percentage is derived only from the actual stored fields.
//  - Age is derived from dateOfBirth; there is no separate stored age value.

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const ACTIVITY_LEVELS = ['sedentary', 'lightly_active', 'active', 'very_active'];

const isEmpty = (v) =>
  v === undefined ||
  v === null ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

const hasPhone = (profile) => {
  if (!profile) return false;
  if (!isEmpty(profile.phone)) return true;
  if (Array.isArray(profile.phoneNumbers)) {
    return profile.phoneNumbers.some((n) => n && !isEmpty(String(n.number || '').trim()));
  }
  return false;
};

const hasEmergency = (profile) => {
  const e = profile && profile.emergencyContact;
  return Boolean(e && !isEmpty(e.name) && !isEmpty(e.phone));
};

const sectionComplete = (section) => section.fields.every((f) => f.complete);

// --- Member ------------------------------------------------------------------

const memberSections = (user, p) => [
  {
    key: 'personal',
    label: 'Personal Information',
    required: true,
    fields: [
      { key: 'name', label: 'Full name', complete: !isEmpty(user && user.name) },
      { key: 'dateOfBirth', label: 'Date of birth', complete: !isEmpty(p && p.dateOfBirth) },
    ],
  },
  {
    key: 'contact',
    label: 'Contact Information',
    required: true,
    fields: [
      { key: 'phone', label: 'Phone number', complete: hasPhone(p) },
    ],
  },
  {
    key: 'body',
    label: 'Body Information',
    required: true,
    fields: [
      { key: 'heightCm', label: 'Height', complete: typeof (p && p.heightCm) === 'number' },
      { key: 'weightKg', label: 'Weight', complete: typeof (p && p.weightKg) === 'number' },
    ],
  },
  {
    key: 'fitness',
    label: 'Fitness Information',
    required: false,
    fields: [
      { key: 'goals', label: 'Fitness goal', complete: Array.isArray(p && p.goals) && p.goals.length > 0 },
    ],
  },
  {
    key: 'emergency',
    label: 'Emergency Contact',
    required: false,
    fields: [
      { key: 'emergencyContact', label: 'Emergency contact', complete: hasEmergency(p) },
    ],
  },
];

// --- Trainer -----------------------------------------------------------------

const trainerSections = (user, p) => [
  {
    key: 'personal',
    label: 'Personal Information',
    required: true,
    fields: [
      { key: 'name', label: 'Full name', complete: !isEmpty(user && user.name) },
      { key: 'phone', label: 'Phone number', complete: !isEmpty(p && p.phone) },
    ],
  },
  {
    key: 'professional',
    label: 'Professional Information',
    required: true,
    fields: [
      { key: 'specializations', label: 'Specialization', complete: Array.isArray(p && p.specializations) && p.specializations.length > 0 },
      { key: 'experience', label: 'Experience', complete: typeof (p && p.experience) === 'number' },
    ],
  },
  {
    key: 'availability',
    label: 'Availability',
    required: true,
    fields: [
      { key: 'workingDays', label: 'Available days', complete: Array.isArray(p && p.workingDays) && p.workingDays.length > 0 },
      {
        key: 'workingHours',
        label: 'Working hours',
        complete: Boolean(p && p.workingHours && p.workingHours.start && p.workingHours.end),
      },
    ],
  },
  {
    key: 'certifications',
    label: 'Certifications & Bio',
    required: false,
    fields: [
      { key: 'certifications', label: 'Certifications', complete: Array.isArray(p && p.certifications) && p.certifications.length > 0 },
      { key: 'bio', label: 'Professional bio', complete: !isEmpty(p && p.bio) },
    ],
  },
  {
    key: 'physical',
    label: 'Physical Information',
    required: false,
    fields: [
      { key: 'heightCm', label: 'Height', complete: typeof (p && p.heightCm) === 'number' },
      { key: 'weightKg', label: 'Weight', complete: typeof (p && p.weightKg) === 'number' },
    ],
  },
];

// --- Scoring -----------------------------------------------------------------

const buildCompletion = (user, profile, sections) => {
  const required = sections.filter((s) => s.required);
  const optional = sections.filter((s) => !s.required);
  const completed = required.filter(sectionComplete).length;
  const percent = required.length > 0 ? Math.round((completed / required.length) * 100) : 100;

  const missing = [];
  for (const section of required) {
    if (sectionComplete(section)) continue;
    for (const field of section.fields) {
      if (!field.complete) missing.push(field.label);
    }
  }

  return {
    percent,
    allRequiredComplete: completed === required.length,
    missing,
    requiredSections: sections.map((s) => ({ key: s.key, label: s.label, required: s.required, complete: sectionComplete(s) })),
  };
};

const memberProfileCompletion = (user, profile) =>
  buildCompletion(user, profile, memberSections(user, profile));

const trainerProfileCompletion = (user, profile) =>
  buildCompletion(user, profile, trainerSections(user, profile));

module.exports = {
  WEEKDAYS,
  ACTIVITY_LEVELS,
  memberProfileCompletion,
  trainerProfileCompletion,
};