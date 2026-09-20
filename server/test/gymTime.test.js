'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  setGymTimezone,
  getGymDateKey,
  getGymDayStart,
  getGymDayEnd,
  getGymDayStartOnDateKey,
  getGymMonthStart,
  getGymWeekdayName,
  isDateWithinGymDay,
  gymWallTimeToUtc,
} = require('../utils/gymTime');

// All assertions are computed against Asia/Kolkata (UTC+05:30, no DST).
// A gym day in IST runs 18:30Z -> 18:30Z.
test.before(() => setGymTimezone('Asia/Kolkata'));
test.after(() => setGymTimezone('Asia/Kolkata'));

const UTC = (y, mo, da, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, da, h, mi, s);

test('gym day key is computed in the gym timezone', () => {
  // 2026-01-01T18:30:00Z is exactly 2026-01-02T00:00:00 IST (new gym day)
  assert.equal(getGymDateKey(new Date(UTC(2026, 1, 1, 18, 30, 0))), '2026-01-02');
  // one second before midnight gym-local
  assert.equal(getGymDateKey(new Date(UTC(2026, 1, 1, 18, 29, 59))), '2026-01-01');
  // midday IST
  assert.equal(getGymDateKey(new Date(UTC(2026, 1, 1, 6, 0, 0))), '2026-01-01');
});

test('gym day start/end instants align to IST midnight', () => {
  const start = getGymDayStartOnDateKey('2026-01-02');
  assert.equal(start.getTime(), UTC(2026, 1, 1, 18, 30, 0));
  const end = getGymDayEnd(start);
  assert.equal(end.getTime(), UTC(2026, 1, 2, 18, 30, 0));
});

test('isDateWithinGymDay respects gym boundaries', () => {
  assert.equal(isDateWithinGymDay(UTC(2026, 1, 1, 18, 30, 0), '2026-01-02'), true);
  assert.equal(isDateWithinGymDay(UTC(2026, 1, 1, 18, 29, 59), '2026-01-02'), false);
});

test('getGymMonthStart is the first gym-local day of the month', () => {
  const s = getGymMonthStart(new Date(UTC(2026, 1, 15, 12, 0, 0)));
  assert.equal(s.getTime(), UTC(2025, 12, 31, 18, 30, 0));
});

test('weekday is computed in gym timezone', () => {
  // 2026-01-02 IST is a Friday
  assert.equal(getGymWeekdayName(new Date(UTC(2026, 1, 1, 18, 30, 0))), 'friday');
});

test('gymWallTimeToUtc converts gym-local wall time to UTC', () => {
  setGymTimezone('Asia/Kolkata');
  // 09:00 IST == 03:30 UTC
  const { hour, minute } = gymWallTimeToUtc(9, 0);
  assert.equal(hour, 3);
  assert.equal(minute, 30);
});

test('timezone is configurable and cached', () => {
  setGymTimezone('Asia/Karachi'); // UTC+05:00
  const key = getGymDateKey(new Date(UTC(2026, 1, 1, 18, 30, 0))); // 23:30 PKT -> same day
  assert.equal(key, '2026-01-01');
  // unchanged: cached value persists
  setGymTimezone('Asia/Kolkata');
  assert.equal(getGymDateKey(new Date(UTC(2026, 1, 1, 18, 30, 0))), '2026-01-02');
});