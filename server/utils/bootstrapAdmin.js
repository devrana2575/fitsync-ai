const User = require('../models/User');

const EMAIL_RE = /^\S+@\S+\.\S+$/;

// Creates the first admin on an empty database. Safe to call on any startup:
// it no-ops when users already exist, never modifies existing accounts and
// never falls back to a predictable/default credential. When no users exist
// the operator MUST provide ADMIN_EMAIL + ADMIN_PASSWORD, otherwise the
// application fails clearly instead of bootstrapping silently.
const bootstrapAdmin = async () => {
  const userCount = await User.countDocuments();
  if (userCount > 0) {
    return { status: 'skipped', reason: 'users-exist' };
  }

  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';

  if (!EMAIL_RE.test(email)) {
    throw new Error(
      '[bootstrap-admin] Database has no users and ADMIN_EMAIL is missing/invalid. ' +
      'Set ADMIN_EMAIL and ADMIN_PASSWORD to create the first admin, or use `npm run seed` in development.'
    );
  }

  const hasLetter = /[A-Za-z]/.test(password);
  const hasDigit = /\d/.test(password);
  if (password.length < 8 || !hasLetter || !hasDigit) {
    throw new Error(
      '[bootstrap-admin] Database has no users and ADMIN_PASSWORD is missing or too weak. ' +
      'Provide a password of at least 8 characters containing both letters and numbers.'
    );
  }

  // Password hashing happens in the User model pre-save hook (bcrypt). Never
  // stored in plaintext, never logged.
  await User.create({ name: 'Gym Admin', email, password, role: 'admin' });
  return { status: 'created', email };
};

module.exports = { bootstrapAdmin };