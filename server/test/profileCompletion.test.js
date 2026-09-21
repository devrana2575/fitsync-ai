'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { setup, teardown, request, registerMember, createTrainer, login, uniqueEmail } = require('./helpers');

const User = require('../models/User');
const TrainerProfile = require('../models/TrainerProfile');

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

let baseUrl;
before(async () => {
  ({ baseUrl } = await setup());
});
after(teardown);

const createTrainerAccount = async () => {
  const user = await User.create({ name: 'Profile Trainer', email: uniqueEmail('trainer'), password: 'Trainer@123', role: 'trainer' });
  await TrainerProfile.create({ user: user._id });
  const token = await login(user.email, 'Trainer@123');
  return { user, token };
};

test('member GET /me returns a deterministic completion payload', async () => {
  const member = await registerMember();
  const me = await request('GET', '/api/auth/me', { token: member.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.completion.percent, 0);
  assert.equal(me.body.completion.allRequiredComplete, false);
  assert.deepEqual(me.body.completion.missing, ['Date of birth', 'Phone number', 'Height', 'Weight']);
});

test('member reaching 100% requires only the defined required fields', async () => {
  const member = await registerMember();
  const upd = await request('PUT', '/api/auth/me', {
    token: member.token,
    body: {
      dateOfBirth: '2000-01-15',
      phoneNumbers: [{ number: '9876543210', label: 'Primary' }],
      heightCm: 175,
      weightKg: 72,
    },
  });
  assert.equal(upd.status, 200, upd.body && upd.body.message);
  assert.equal(upd.body.completion.percent, 100);
  assert.equal(upd.body.completion.allRequiredComplete, true);

  const me = await request('GET', '/api/auth/me', { token: member.token });
  assert.equal(me.body.completion.percent, 100);
  assert.deepEqual(me.body.completion.missing, []);
  const optional = me.body.completion.requiredSections.filter((s) => !s.required);
  assert.ok(optional.some((s) => s.key === 'fitness' && !s.complete));
  assert.ok(optional.some((s) => s.key === 'emergency' && !s.complete));
});

test('member fitness, preference and health fields persist', async () => {
  const member = await registerMember();
  const upd = await request('PUT', '/api/auth/me', {
    token: member.token,
    body: {
      goals: ['muscle_gain', 'strength'],
      activityLevel: 'active',
      preferredWorkoutDays: ['Monday', 'Thursday'],
      preferredWorkoutDuration: 60,
      injuries: 'Old knee strain',
      medicalConditions: 'Asthma',
      allergies: ['penicillin'],
      emergencyContact: { name: 'Sita', phone: '9123456780', relationship: 'Sister' },
    },
  });
  assert.equal(upd.status, 200, upd.body && upd.body.message);
  const me = await request('GET', '/api/auth/me', { token: member.token });
  assert.equal(me.body.profile.activityLevel, 'active');
  assert.deepEqual(me.body.profile.preferredWorkoutDays, ['Monday', 'Thursday']);
  assert.equal(me.body.profile.preferredWorkoutDuration, 60);
  assert.equal(me.body.profile.injuries, 'Old knee strain');
  assert.deepEqual(me.body.profile.goals, ['muscle_gain', 'strength']);
  assert.equal(me.body.profile.emergencyContact.name, 'Sita');
});

test('member profile input validation', async () => {
  const member = await registerMember();

  const cases = [
    [{ dateOfBirth: '2999-01-01' }, /future/],
    [{ dateOfBirth: '1900-01-01' }, /realistic/],
    [{ heightCm: 5000 }, /Height must be between/],
    [{ weightKg: 1 }, /Weight must be between/],
    [{ activityLevel: 'hyper' }, /Invalid activity level/],
    [{ preferredWorkoutDays: ['Funday'] }, /valid weekdays/],
    [{ preferredWorkoutDuration: 10 }, /must be between 15 and 300/],
    [{ emergencyContact: { name: 'X', phone: '123' } }, /valid emergency contact phone/],
  ];

  for (const [body, pattern] of cases) {
    const res = await request('PUT', '/api/auth/me', { token: member.token, body });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(res.body.message, pattern);
  }
});

test('a member can only change their own profile - no role/status mass assignment', async () => {
  const member = await registerMember();
  const upd = await request('PUT', '/api/auth/me', {
    token: member.token,
    body: { role: 'admin', isActive: false, assignedTrainer: member.user.id },
  });
  assert.equal(upd.status, 200);
  const me = await request('GET', '/api/auth/me', { token: member.token });
  assert.equal(me.body.user.role, 'member');
  assert.equal(me.body.user.isActive, true);
  assert.equal(me.body.profile.assignedTrainer, undefined);
  assert.equal(me.body.profile.trainerAssignmentStatus, 'NONE');
});

test('members cannot read any other member profile (isolation)', async () => {
  const a = await registerMember();
  const b = await registerMember();
  const res = await request('GET', `/api/members/${b.user.id}`, { token: a.token });
  assert.equal(res.status, 403);
});

test('trainers cannot edit members through admin routes', async () => {
  const trainer = await createTrainer();
  const trainerToken = await login(trainer.email, 'Trainer@123');
  const member = await registerMember();
  const res = await request('PUT', `/api/members/${member.user.id}`, {
    token: trainerToken,
    body: { name: 'Hacked' },
  });
  assert.equal(res.status, 403);
});

test('trainer GET /me reports completion and professional fields persist', async () => {
  const { token } = await createTrainerAccount();
  const before = await request('GET', '/api/auth/me', { token });
  assert.equal(before.status, 200);
  assert.equal(before.body.completion.percent, 0);

  const upd = await request('PUT', '/api/auth/me', {
    token,
    body: {
      phone: '9876500001',
      specializations: ['Strength Training', 'Weight Loss'],
      experience: 5,
      certifications: [{ name: 'Certified PT', issuer: 'ACE', year: 2020 }],
      languages: ['English', 'Hindi'],
      workingDays: ['Monday', 'Wednesday', 'Friday'],
      workingHours: { start: '06:00', end: '12:00' },
      bio: 'Strength coach focused on progressive overload.',
    },
  });
  assert.equal(upd.status, 200, upd.body && upd.body.message);
  assert.equal(upd.body.completion.percent, 100);

  const me = await request('GET', '/api/auth/me', { token });
  assert.equal(me.body.profile.specializations.length, 2);
  assert.equal(me.body.profile.experience, 5);
  assert.equal(me.body.profile.certifications[0].name, 'Certified PT');
  assert.deepEqual(me.body.profile.languages, ['English', 'Hindi']);
  assert.deepEqual(me.body.profile.workingDays, ['Monday', 'Wednesday', 'Friday']);
  assert.deepEqual(me.body.profile.workingHours, { start: '06:00', end: '12:00' });
});

test('trainer profile validation', async () => {
  const { token } = await createTrainerAccount();

  const pos = await request('PUT', '/api/auth/me', { token, body: { experience: -1 } });
  assert.equal(pos.status, 400);
  assert.match(pos.body.message, /Experience must be between 0 and 80/);

  const days = await request('PUT', '/api/auth/me', { token, body: { workingDays: ['Someday'] } });
  assert.equal(days.status, 400);
  assert.match(days.body.message, /valid weekdays/);

  const hours = await request('PUT', '/api/auth/me', { token, body: { workingHours: { start: '25:00', end: '12:00' } } });
  assert.equal(hours.status, 400);
  assert.match(hours.body.message, /24h times/);

  const order = await request('PUT', '/api/auth/me', { token, body: { workingHours: { start: '18:00', end: '08:00' } } });
  assert.equal(order.status, 400);
  assert.match(order.body.message, /end must be after start/);

  const half = await request('PUT', '/api/auth/me', { token, body: { workingHours: { start: '06:00' } } });
  assert.equal(half.status, 400);
  assert.match(half.body.message, /required together/);

  const certs = await request('PUT', '/api/auth/me', { token, body: { certifications: [{ name: '' }] } });
  assert.equal(certs.status, 400);
  assert.match(certs.body.message, /needs a name/);
});

test('trainer partial profile saves (optional fields not forced)', async () => {
  const { token } = await createTrainerAccount();
  const upd = await request('PUT', '/api/auth/me', {
    token,
    body: { phone: '9876500002', specializations: ['General Fitness'], experience: 2 },
  });
  assert.equal(upd.status, 200, upd.body && upd.body.message);
  assert.ok(upd.body.completion.percent >= 33);
  const me = await request('GET', '/api/auth/me', { token });
  assert.equal(me.body.profile.phone, '9876500002');
});

test('member can upload, replace and remove a profile photo', async () => {
  const member = await registerMember();
  const upload = async () => {
    const form = new FormData();
    form.append('photo', new Blob([PNG_1x1], { type: 'image/png' }), 'avatar.png');
    return fetch(`${baseUrl}/api/auth/me/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${member.token}` },
      body: form,
    });
  };

  let firstRes;
  let firstPath = null;
  try {
    firstRes = await upload();
    assert.equal(firstRes.status, 200);
    const firstBody = await firstRes.json();
    assert.match(firstBody.user.avatar, /^\/uploads\/avatars\//);
    firstPath = firstBody.user.avatar;

    const second = await upload();
    assert.equal(second.status, 200);
    const secondBody = await second.json();
    assert.notEqual(secondBody.user.avatar, firstPath);
    // The replaced file is removed server-side.
    assert.equal(fs.existsSync(path.join(__dirname, '..', 'uploads', 'avatars', path.basename(firstPath))), false);

    const bad = new FormData();
    bad.append('photo', new Blob(['not an image'], { type: 'text/plain' }), 'note.txt');
    const badRes = await fetch(`${baseUrl}/api/auth/me/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${member.token}` },
      body: bad,
    });
    assert.equal(badRes.status, 400);

    const del = await fetch(`${baseUrl}/api/auth/me/avatar`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${member.token}` },
    });
    assert.equal(del.status, 200);
    const delBody = await del.json();
    assert.equal(delBody.user.avatar, '');
    assert.equal(fs.existsSync(path.join(__dirname, '..', 'uploads', 'avatars', path.basename(secondBody.user.avatar))), false);
  } finally {
    // Best-effort cleanup of anything the test left behind.
    for (const p of [firstPath]) {
      if (p) {
        const full = path.join(__dirname, '..', 'uploads', 'avatars', path.basename(p));
        if (fs.existsSync(full)) fs.unlinkSync(full);
      }
    }
  }
});

test('profile photo upload requires authentication', async () => {
  const res = await fetch(`${baseUrl}/api/auth/me/avatar`, {
    method: 'POST',
    body: new FormData(),
  });
  assert.equal(res.status, 401);
});