const DAY_MS = 86400000;

let gymTimezone = process.env.GYM_TIMEZONE || 'Asia/Kolkata';

const setGymTimezone = (tz) => {
  if (tz && typeof tz === 'string' && (String(tz).trim().length > 0)) {
    gymTimezone = String(tz).trim();
  }
};

const getGymTimezone = () => gymTimezone;

const tzOffsetMs = (tz, date) => {
  const seen = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);
  const map = {};
  for (const p of seen) map[p.type] = p.value;
  let hour = parseInt(map.hour, 10);
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second)
  );
  return asUtc - date.getTime();
};

const zonedDayStart = (tz, date) => {
  const offsetAtNow = tzOffsetMs(tz, date);
  const wallDayStart = Math.floor((date.getTime() + offsetAtNow) / DAY_MS) * DAY_MS;
  const noonGuess = wallDayStart + DAY_MS / 2 - offsetAtNow;
  const offsetAtTarget = tzOffsetMs(tz, new Date(noonGuess));
  return new Date(wallDayStart - offsetAtTarget);
};

// Instant (Date) at 00:00:00 of the current gym day.
const getGymDayStart = (now = new Date()) => zonedDayStart(gymTimezone, now);

// Instant (Date) at 00:00:00 of a specific YYYY-MM-DD gym-local day.
const getGymDayStartOnDateKey = (dateKey) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, day);
  return new Date(guess - tzOffsetMs(gymTimezone, new Date(guess)));
};

// Instant (Date) at 00:00:00 of the next gym day.
const getGymDayEnd = (now = new Date()) => {
  const start = getGymDayStart(now);
  return zonedDayStart(gymTimezone, new Date(start.getTime() + DAY_MS));
};

// YYYY-MM-DD string of the gym-local date for the given instant.
const getGymDateKey = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: gymTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
};

// Instant (Date) at 00:00:00 of the first gym-local day of the month.
const getGymMonthStart = (now = new Date()) => {
  const [year, month] = getGymDateKey(now).split('-').map(Number);
  const guess = Date.UTC(year, month - 1, 1);
  return new Date(guess - tzOffsetMs(gymTimezone, new Date(guess)));
};

const getGymMonthEnd = (now = new Date()) => {
  const [year, month] = getGymDateKey(now).split('-').map(Number);
  const guess = Date.UTC(year, month, 1);
  return new Date(guess - tzOffsetMs(gymTimezone, new Date(guess)));
};

// Lowercase weekday name (e.g. "monday") in the gym timezone.
const getGymWeekdayName = (now = new Date()) =>
  new Intl.DateTimeFormat('en-US', { timeZone: gymTimezone, weekday: 'long' }).format(now).toLowerCase();

const isDateWithinGymDay = (date, gymDayKey) => getGymDateKey(new Date(date)) === gymDayKey;

// Convert a gym-local wall-clock time to a UTC {hour, minute} pair so that
// host-local cron schedules can fire at gym-local times on a UTC host.
const gymWallTimeToUtc = (hour, minute) => {
  const today = new Date();
  const utcStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const candidate = utcStart + (hour * 60 + minute) * 60000;
  const offset = tzOffsetMs(gymTimezone, new Date(candidate));
  const utc = new Date(candidate - offset);
  return { hour: utc.getUTCHours(), minute: utc.getUTCMinutes() };
};

module.exports = {
  setGymTimezone,
  getGymTimezone,
  getGymDayStart,
  getGymDayEnd,
  getGymDayStartOnDateKey,
  getGymDateKey,
  getGymMonthStart,
  getGymMonthEnd,
  getGymWeekdayName,
  isDateWithinGymDay,
  gymWallTimeToUtc
};