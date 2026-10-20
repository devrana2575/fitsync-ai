'use strict';

// One-time migration: make multiple ACTIVE memberships per user a supported
// business rule on EXISTING databases.
//
// The application schema no longer declares the { user: 1 } unique partial
// index filtered to status ACTIVE (index name `user_1_active`), and a fresh
// database never gets one - but MongoDB only applies schema index changes to
// collections it syncs, so a pre-existing database still enforces the old
// "one ACTIVE membership per user" rule until this script drops it.
//
// This script:
//   1. Drops the legacy `user_1_active` unique partial index (if present).
//   2. Reports how many users now hold several ACTIVE memberships.
//   3. Verifies every ACTIVE membership has a planSnapshot (creation backstop)
//      and reports - never rewrites - trainer assignment state. It must NOT
//      copy a profile-level trainer onto every membership: legacy rows keep
//      `trainerAssignment.assignmentInitialized=false` and read through the
//      profile mirror until a real assignment flow initializes them.
//
// Usage:  node scripts/migrate-membership-independence.js [--dry-run]
// Idempotent: safe to run repeatedly.

const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DRY_RUN = process.argv.includes('--dry-run');

const run = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/fitsync-ai';
  console.log(`[migrate] connecting to ${uri.replace(/\/\/[^@]*@/, '//***@')}${DRY_RUN ? ' (dry run)' : ''}`);
  await mongoose.connect(uri);

  try {
    const db = mongoose.connection.db;
    const memberships = db.collection('memberships');

    // --- 1. legacy unique index -------------------------------------------
    const indexes = await memberships.indexes();
    const legacy = indexes.filter((idx) =>
      idx.unique === true
      && idx.partialFilterExpression
      && idx.partialFilterExpression.status === 'ACTIVE'
      && idx.key && idx.key.user === 1
    );

    if (legacy.length === 0) {
      console.log('[migrate] no legacy unique ACTIVE-per-user index found (already migrated)');
    } else {
      for (const idx of legacy) {
        if (DRY_RUN) {
          console.log(`[migrate] DRY RUN - would drop index "${idx.name}"`);
        } else {
          await memberships.dropIndex(idx.name);
          console.log(`[migrate] dropped legacy index "${idx.name}"`);
        }
      }
    }

    // --- 2. multiple ACTIVE memberships ------------------------------------
    const multi = await memberships.aggregate([
      { $match: { status: 'ACTIVE' } },
      { $group: { _id: '$user', actives: { $sum: 1 } } },
      { $match: { actives: { $gt: 1 } } },
      { $sort: { actives: -1 } }
    ]).toArray();
    console.log(`[migrate] users holding >1 ACTIVE membership: ${multi.length}`);
    for (const row of multi.slice(0, 20)) {
      console.log(`[migrate]   user ${row._id}: ${row.actives} active memberships`);
    }

    // --- 3. snapshot + assignment readout (report only) ---------------------
    const activeWithoutSnapshot = await memberships.countDocuments({
      status: 'ACTIVE',
      $or: [{ planSnapshot: { $exists: false } }, { 'planSnapshot.name': { $exists: false } }]
    });
    console.log(`[migrate] ACTIVE memberships without a committed planSnapshot: ${activeWithoutSnapshot}`);

    const initialized = await memberships.countDocuments({ 'trainerAssignment.assignmentInitialized': true });
    const legacyAssignments = await memberships.countDocuments({
      $or: [
        { 'trainerAssignment.assignmentInitialized': { $exists: false } },
        { 'trainerAssignment.assignmentInitialized': false }
      ]
    });
    console.log(`[migrate] membership-level assignments initialized: ${initialized}, legacy (profile-mirror) rows: ${legacyAssignments}`);
    console.log('[migrate] legacy rows intentionally NOT rewritten - readers fall back to the profile mirror');

    console.log('[migrate] done');
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
