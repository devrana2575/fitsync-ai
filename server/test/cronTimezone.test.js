'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setGymTimezone, getGymTimezone } = require('../utils/gymTime');
const { buildCronExpressions, startCronJobs, stopCronJobs, rescheduleCronJobs } = require('../utils/cron');

before(() => setGymTimezone('Asia/Kolkata'));
after(() => setGymTimezone('Asia/Kolkata'));

// Independent wall-clock->UTC conversion (replicates gymTime maths with era
// functions only) so the cron assertions are not circular with the code under
// test. DST-aware because it derives the offset for the current date.
const offsetMinutesFromUtc = (tz, at) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(at);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  let hour = parseInt(map.hour, 10);
  if (hour === 24) hour = 0;
  const wall = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), hour, Number(map.minute), Number(map.second));
  return Math.round((wall - at.getTime()) / 60000);
};

const wallToUtc = (tz, hour, minute) => {
  const today = new Date();
  const utcStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const candidate = new Date(utcStart + (hour * 60 + minute) * 60000);
  const utc = new Date(candidate.getTime() - offsetMinutesFromUtc(tz, candidate) * 60000);
  return { hour: utc.getUTCHours(), minute: utc.getUTCMinutes() };
};

test('gym timezone defaults to Asia/Kolkata', () => {
  assert.equal(getGymTimezone(), 'Asia/Kolkata');
});

test('buildCronExpressions converts gym-local triggers to UTC for Asia/Kolkata', () => {
  const jobs = buildCronExpressions('Asia/Kolkata');
  assert.equal(jobs.length, 3);

  assert.deepEqual(
    { expression: jobs[0].expression, timezone: jobs[0].timezone, target: jobs[0].target },
    { expression: '30 02 * * *', timezone: 'Etc/UTC', target: 'generateNotifications_daily' },
    '08:00 IST == 02:30 UTC'
  );
  assert.deepEqual(
    { expression: jobs[1].expression, timezone: jobs[1].timezone, target: jobs[1].target },
    { expression: '30 06 * * 1', timezone: 'Etc/UTC', target: 'generateNotifications_monday' },
    'Monday 12:00 IST == 06:30 UTC Monday (day-of-week preserved)'
  );
  assert.deepEqual(
    { expression: jobs[2].expression, timezone: jobs[2].timezone, target: jobs[2].target },
    { expression: '45 18 * * *', timezone: 'Etc/UTC', target: 'expireMemberships_daily' },
    '00:15 IST next-day == 18:45 UTC previous day'
  );
});

test('a different gym timezone remaps the UTC expressions and is restored', () => {
  setGymTimezone('America/New_York');
  const jobs = buildCronExpressions('America/New_York');
  assert.equal(jobs.length, 3);

  const daily = wallToUtc('America/New_York', 8, 0);
  assert.equal(jobs[0].expression, `${String(daily.minute).padStart(2, '0')} ${String(daily.hour).padStart(2, '0')} * * *`);

  const monday = wallToUtc('America/New_York', 12, 0);
  assert.equal(jobs[1].expression, `${String(monday.minute).padStart(2, '0')} ${String(monday.hour).padStart(2, '0')} * * 1`);

  const expiry = wallToUtc('America/New_York', 0, 15);
  assert.equal(jobs[2].expression, `${String(expiry.minute).padStart(2, '0')} ${String(expiry.hour).padStart(2, '0')} * * *`);

  for (const job of jobs) {
    assert.equal(job.timezone, 'Etc/UTC');
  }

  setGymTimezone('Asia/Kolkata');
  assert.equal(getGymTimezone(), 'Asia/Kolkata', 'tests restore the cached gym timezone');
});

test('startCronJobs registers Etc/UTC schedules and rescheduleCronJobs is safe to repeat', () => {
  const cron = require('node-cron');
  const originalSchedule = cron.schedule;
  const registered = [];
  const spy = (expression, handler, options) => {
    registered.push({ expression, timezone: options && options.timezone });
    return { stop() {} };
  };
  cron.schedule = spy;

  try {
    setGymTimezone('Asia/Kolkata');
    startCronJobs();
    assert.equal(registered.length, 3);
    const expected = buildCronExpressions('Asia/Kolkata');
    expected.forEach((job, i) => {
      assert.equal(registered[i].expression, job.expression);
      assert.equal(registered[i].timezone, 'Etc/UTC');
    });

    rescheduleCronJobs();
    assert.equal(registered.length, 6, 'reschedule re-registers every job');

    stopCronJobs();
    assert.equal(registered.length, 6, 'stop does not re-register');
  } finally {
    cron.schedule = originalSchedule;
    stopCronJobs();
  }
});