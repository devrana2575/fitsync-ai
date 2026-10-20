'use strict';
// Multiple ACTIVE memberships per user + membership-level trainer assignment +
// trainer sick-leave workflow (temporary replacement, private medical
// certificate, cron reconcile/restore).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { setup, teardown, request, registerMember, adminContext, uniqueEmail } = require('./helpers');

const User = require('../models/User');
const Membership = require('../models/Membership');
const MemberProfile = require('../models/MemberProfile');
const TrainerProfile = require('../models/TrainerProfile');
const TrainerSickLeave = require('../models/TrainerSickLeave');
const { allocateTrainerForMembership } = require('../utils/trainerAllocation');
const { reconcileSickLeaves, installCoversForLeave } = require('../utils/sickLeaveCoverage');
const { PRIVATE_DIR } = require('../utils/medicalCertificates');
const { getGymDateKey } = require('../utils/gymTime');

let baseUrl;
before(async () => {
  ({ baseUrl } = await setup());
});
after(teardown);

let counter = 0;
const uniqueName = (base) => `${base} ${++counter} (${Date.now()})`;

const createPlan = async (token, over = {}) => {
  const res = await request('POST', '/api/membership-plans', {
    token,
    body: { name: uniqueName('Plan'), price: 1000, duration: 30, ...over },
  });
  assert.equal(res.status, 201, res.body && res.body.message);
  return res.body.plan;
};

const makeTrainer = async ({ name, specializations = [], maxMembers = 50 } = {}) => {
  const user = await User.create({ name, email: uniqueEmail('trainer'), password: 'Trainer@123', role: 'trainer' });
  await TrainerProfile.create({ user: user._id, phone: '9876543210', specializations, maxMembers, isAvailable: true });
  return user;
};

const trainerToken = async (trainer) => {
  const res = await request('POST', '/api/auth/login', { body: { email: trainer.email, password: 'Trainer@123' } });
  assert.ok(res.body && res.body.token, res.body && res.body.message);
  return res.body.token;
};

const activatePlan = async (token, member, plan) => {
  const res = await request('POST', '/api/payments', {
    token,
    body: { userId: member.user.id, planId: plan._id, amount: plan.price, method: 'cash', status: 'COMPLETED' },
  });
  assert.equal(res.status, 201, res.body && res.body.message);
  const my = await request('GET', '/api/memberships/my', { token: member.token });
  const found = (my.body.memberships || []).find((m) => String(m.plan && m.plan._id) === String(plan._id) && m.status === 'ACTIVE');
  assert.ok(found, 'activated membership is returned by /my');
  return found;
};

const pinTrainer = async (memberId, trainerId) => {
  const profile = await MemberProfile.findOne({ user: memberId });
  profile.assignedTrainer = trainerId;
  profile.trainerAssignmentStatus = 'ASSIGNED';
  await profile.save();
};

// Minimal valid PNG magic-byte prefix (content sniffing only cares about the
// leading signature; the medical store never renders server-side).
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n%âãÏÓ\n');

const multipart = (fields, file) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  if (file) form.append('certificate', new Blob([file.bytes], { type: file.mime }), file.name);
  return form;
};

const submitLeave = async (token, { startKey, endKey, reason = 'Fever and body ache', cert = null } = {}) => {
  const res = await fetch(`${baseUrl}/api/sick-leaves`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: multipart({ startDate: startKey, endDate: endKey, reason }, cert)
  });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body };
};

const uploadCertificate = async (leaveId, token, file = { bytes: PNG_BYTES, mime: 'image/png', name: 'cert.png' }) => {
  const res = await fetch(`${baseUrl}/api/sick-leaves/${leaveId}/certificate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: multipart({}, file)
  });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body };
};

// ---------------------------------------------------------------------------
// Multiple ACTIVE memberships per user, independent trainers
// ---------------------------------------------------------------------------

test('a member holds several ACTIVE memberships, each with its own independent trainer', async () => {
  const { token } = await adminContext();
  await TrainerProfile.updateMany({}, { isAvailable: false });
  const ash = await makeTrainer({ name: 'Ash K' });
  const zoe = await makeTrainer({ name: 'Zoe K' });
  const planA = await createPlan(token, { trainerIncluded: true, trainerAllocationMode: 'ASSIGNED' });
  const planB = await createPlan(token, { trainerIncluded: true, trainerAllocationMode: 'ASSIGNED' });

  const member = await registerMember();
  await pinTrainer(member.user.id, ash._id);
  const membershipA = await activatePlan(token, member, planA);

  // Second membership: clear the manual pin first so the pool picks the
  // lowest-load trainer (zoe, since ash already carries this member).
  await MemberProfile.updateOne({ user: member.user.id }, { $unset: { assignedTrainer: 1 }, trainerAssignmentStatus: 'NONE' });
  const membershipB = await activatePlan(token, member, planB);
  assert.notEqual(String(membershipA._id), String(membershipB._id));

  const rows = await Membership.find({ user: member.user.id, status: 'ACTIVE' }).lean();
  assert.equal(rows.length, 2, 'two concurrent ACTIVE memberships');
  const byId = new Map(rows.map((r) => [String(r._id), r]));
  assert.equal(String(byId.get(String(membershipA._id)).trainerAssignment.currentTrainer), String(ash._id));
  assert.equal(String(byId.get(String(membershipB._id)).trainerAssignment.currentTrainer), String(zoe._id));

  // The admin-facing active endpoint returns ALL active memberships.
  const active = await request('GET', `/api/memberships/active/${member.user.id}`, { token });
  assert.equal(active.status, 200);
  assert.equal(active.body.memberships.length, 2);
  assert.ok(active.body.membership && active.body.membership._id, 'legacy single-membership field still present');

  // The member dashboard exposes the full list plus a trainer block.
  const dash = await request('GET', '/api/analytics/member/dashboard', { token: member.token });
  assert.equal(dash.status, 200);
  assert.equal(dash.body.memberships.length, 2);
  assert.ok(dash.body.trainer, 'dashboard surfaces the primary membership trainer');

  // /my serializes the trainer block per membership.
  const my = await request('GET', '/api/memberships/my', { token: member.token });
  const aView = my.body.memberships.find((m) => String(m._id) === String(membershipA._id));
  const bView = my.body.memberships.find((m) => String(m._id) === String(membershipB._id));
  assert.equal(String(aView.trainer._id), String(ash._id));
  assert.equal(String(bView.trainer._id), String(zoe._id));
  assert.equal(aView.temporaryReplacement, false);
});

test('admin assign-trainer writes through to every entitled membership with history', async () => {
  const { token } = await adminContext();
  await TrainerProfile.updateMany({}, { isAvailable: false });
  const ash = await makeTrainer({ name: 'Ash J' });
  const zoe = await makeTrainer({ name: 'Zoe J' });
  const plan = await createPlan(token, { trainerIncluded: true, trainerAllocationMode: 'ASSIGNED' });

  const member = await registerMember();
  await pinTrainer(member.user.id, ash._id);
  await activatePlan(token, member, plan);

  const assign = await request('POST', `/api/members/${member.user.id}/assign-trainer`, {
    token,
    body: { trainerId: zoe._id },
  });
  assert.equal(assign.status, 200, assign.body && assign.body.message);

  const membership = await Membership.findOne({ user: member.user.id, status: 'ACTIVE' });
  assert.equal(String(membership.trainerAssignment.currentTrainer), String(zoe._id));
  const last = membership.trainerAssignment.history[membership.trainerAssignment.history.length - 1];
  assert.equal(last.reason, 'ADMIN_CHANGE');
  assert.equal(String(last.previousTrainer), String(ash._id));

  const profile = await MemberProfile.findOne({ user: member.user.id });
  assert.equal(String(profile.assignedTrainer), String(zoe._id), 'compatibility mirror follows');
});

// ---------------------------------------------------------------------------
// Sick-leave workflow
// ---------------------------------------------------------------------------

test('sick-leave lifecycle: submit, certificate-gated approval, cover install, reconcile restore', async () => {
  const { token: adminTok, user: adminUser } = await adminContext();
  await TrainerProfile.updateMany({}, { isAvailable: false });
  const ash = await makeTrainer({ name: 'Ash S' });
  const zoe = await makeTrainer({ name: 'Zoe S' });
  const plan = await createPlan(adminTok, { trainerIncluded: true, trainerAllocationMode: 'ASSIGNED' });

  const member = await registerMember();
  await pinTrainer(member.user.id, ash._id);
  const membership = await activatePlan(adminTok, member, plan);
  const ashTok = await trainerToken(ash);

  const startKey = getGymDateKey();
  const endKey = getGymDateKey(new Date(Date.now() + 3 * 86400000));

  const submit = await submitLeave(ashTok, { startKey, endKey });
  assert.equal(submit.status, 201, submit.body && submit.body.message);
  const leaveId = submit.body.leave._id;
  assert.equal(submit.body.leave.status, 'PENDING');
  assert.equal(submit.body.leave.hasCertificate, false);

  // Overlapping request is rejected.
  const overlap = await submitLeave(ashTok, { startKey: endKey, endKey: getGymDateKey(new Date(Date.now() + 6 * 86400000)) });
  assert.equal(overlap.status, 409);

  // Approval without a medical certificate is refused.
  const noCert = await request('POST', `/api/sick-leaves/${leaveId}/approve`, { token: adminTok, body: {} });
  assert.equal(noCert.status, 400);
  assert.match(noCert.body.message, /certificate/i);

  // Trainer attaches the certificate (JPEG/PNG/PDF accepted, magic-byte sniffed).
  const upload = await uploadCertificate(leaveId, ashTok);
  assert.equal(upload.status, 200, upload.body && upload.body.message);
  assert.equal(upload.body.leave.hasCertificate, true);
  assert.ok(!JSON.stringify(upload.body).includes('.png'), 'stored filename never leaks to the API');

  // Invalid bytes are rejected outright (nothing written).
  const bad = await uploadCertificate(leaveId, ashTok, { bytes: new TextEncoder().encode('not-a-certificate'), mime: 'application/pdf', name: 'evil.pdf' });
  assert.equal(bad.status, 400);

  // Approve now succeeds and installs a temporary cover.
  const approve = await request('POST', `/api/sick-leaves/${leaveId}/approve`, { token: adminTok, body: { note: 'rest well' } });
  assert.equal(approve.status, 200, approve.body && approve.body.message);
  assert.equal(approve.body.leave.status, 'APPROVED');
  assert.equal(approve.body.coverage.covered, 1, 'one membership covered');

  const covered = await Membership.findById(membership._id);
  const assignment = covered.trainerAssignment;
  assert.equal(String(assignment.currentTrainer), String(zoe._id), 'replacement installed');
  assert.equal(String(assignment.originalTrainer), String(ash._id), 'original preserved');
  assert.equal(assignment.temporaryReplacement, true);
  assert.equal(String(assignment.sickLeave), String(leaveId));
  const sickEntry = assignment.history[assignment.history.length - 1];
  assert.equal(sickEntry.reason, 'SICK_LEAVE');

  // Member was notified about the temporary cover.
  const notice = await request('GET', '/api/notifications', { token: member.token });
  const coveredNotice = (notice.body.notifications || notice.body || []).find((n) => /covering your training/i.test(n.message || ''));
  assert.ok(coveredNotice, 'member gets a temporary-cover notification');

  // Private certificate: admin can stream it, an unrelated trainer cannot,
  // and the bytes are stored OUTSIDE the public /uploads tree.
  const certRes = await fetch(`${baseUrl}/api/sick-leaves/${leaveId}/certificate`, { headers: { Authorization: `Bearer ${adminTok}` } });
  assert.equal(certRes.status, 200);
  assert.equal(certRes.headers.get('content-type'), 'image/png');
  assert.equal((await certRes.arrayBuffer()).byteLength, PNG_BYTES.length);
  const storedName = (await TrainerSickLeave.findById(leaveId)).medicalCertificate.filename;
  assert.ok(fs.existsSync(path.join(PRIVATE_DIR, storedName)), 'file lives in the private dir');
  assert.ok(!path.join(PRIVATE_DIR, storedName).startsWith(path.join(__dirname, '..', 'uploads')), 'never under the public uploads tree');
  assert.match(storedName, /^[a-f0-9]{48}\.png$/, 'on-disk name is a random non-guessable id');

  const stranger = await makeTrainer({ name: 'Mallory' });
  const strangerTok = await trainerToken(stranger);
  const denied = await fetch(`${baseUrl}/api/sick-leaves/${leaveId}/certificate`, { headers: { Authorization: `Bearer ${strangerTok}` } });
  assert.equal(denied.status, 403);

  // No leave can ever be approved by the admin who owns it.
  const ownLeave = await TrainerSickLeave.create({ trainer: adminUser._id, startDate: new Date(), endDate: new Date(Date.now() + 86400000), reason: 'self' });
  const selfApprove = await request('POST', `/api/sick-leaves/${ownLeave._id}/approve`, { token: adminTok, body: {} });
  assert.ok([400, 403].includes(selfApprove.status), 'self-approval refused');

  // Reconcile after the end instant: originals restored, leave COMPLETED.
  const stale = await TrainerSickLeave.findById(leaveId);
  stale.endDate = new Date(Date.now() - 1000);
  await stale.save();
  await reconcileSickLeaves();

  const restored = await Membership.findById(membership._id);
  assert.equal(String(restored.trainerAssignment.currentTrainer), String(ash._id), 'original trainer restored');
  assert.equal(restored.trainerAssignment.temporaryReplacement, false);
  assert.equal(restored.trainerAssignment.sickLeave, null);
  const restoreEntry = restored.trainerAssignment.history[restored.trainerAssignment.history.length - 1];
  assert.equal(restoreEntry.reason, 'RETURN_FROM_LEAVE');

  const done = await TrainerSickLeave.findById(leaveId);
  assert.equal(done.status, 'COMPLETED');
  assert.ok(done.completedAt, 'completion timestamped');
});

test('rejecting a leave never touches assignments; cancelling an approved leave restores covers', async () => {
  const { token: adminTok } = await adminContext();
  await TrainerProfile.updateMany({}, { isAvailable: false });
  const ash = await makeTrainer({ name: 'Ash C' });
  const zoe = await makeTrainer({ name: 'Zoe C' });
  const plan = await createPlan(adminTok, { trainerIncluded: true, trainerAllocationMode: 'ASSIGNED' });

  const member = await registerMember();
  await pinTrainer(member.user.id, ash._id);
  const membership = await activatePlan(adminTok, member, plan);
  const ashTok = await trainerToken(ash);

  // Starts today so approval installs covers immediately (a future-dated
  // leave would wait for the reconcile sweep on its start day).
  const startKey = getGymDateKey();
  const endKey = getGymDateKey(new Date(Date.now() + 2 * 86400000));

  // Rejected leave: no coverage, trainer keeps the member.
  const submit = await submitLeave(ashTok, { startKey, endKey, reason: 'Dental work' });
  const reject = await request('POST', `/api/sick-leaves/${submit.body.leave._id}/reject`, { token: adminTok, body: { note: 'certificate incomplete' } });
  assert.equal(reject.status, 200);
  assert.equal(reject.body.leave.status, 'REJECTED');
  assert.equal(reject.body.leave.reviewNote, 'certificate incomplete');
  let row = await Membership.findById(membership._id);
  assert.equal(String(row.trainerAssignment.currentTrainer), String(ash._id), 'rejection never moves assignments');

  // Approved leave cancelled by the trainer: covers restored first.
  const second = await submitLeave(ashTok, { startKey, endKey, reason: 'Migraine' });
  await uploadCertificate(second.body.leave._id, ashTok, { bytes: PDF_BYTES, mime: 'application/pdf', name: 'cert.pdf' });
  const approve = await request('POST', `/api/sick-leaves/${second.body.leave._id}/approve`, { token: adminTok, body: {} });
  assert.equal(approve.status, 200, approve.body && approve.body.message);
  assert.equal(approve.body.coverage.covered, 1);

  row = await Membership.findById(membership._id);
  assert.equal(String(row.trainerAssignment.currentTrainer), String(zoe._id), 'cover installed');

  const cancel = await request('POST', `/api/sick-leaves/${second.body.leave._id}/cancel`, { token: ashTok, body: {} });
  assert.equal(cancel.status, 200, cancel.body && cancel.body.message);
  assert.equal(cancel.body.leave.status, 'CANCELLED');

  row = await Membership.findById(membership._id);
  assert.equal(String(row.trainerAssignment.currentTrainer), String(ash._id), 'cancellation restored the original');
  assert.equal(row.trainerAssignment.temporaryReplacement, false);
  assert.equal(row.trainerAssignment.sickLeave, null);
});

test('an admin reassignment during the leave is never reverted by the restore sweep', async () => {
  const { token: adminTok } = await adminContext();
  await TrainerProfile.updateMany({}, { isAvailable: false });
  const ash = await makeTrainer({ name: 'Ash R' });
  const zoe = await makeTrainer({ name: 'Zoe R' });
  const kit = await makeTrainer({ name: 'Kit R' });
  const plan = await createPlan(adminTok, { trainerIncluded: true, trainerAllocationMode: 'ASSIGNED' });

  const member = await registerMember();
  await pinTrainer(member.user.id, ash._id);
  const membership = await activatePlan(adminTok, member, plan);
  const ashTok = await trainerToken(ash);

  const startKey = getGymDateKey();
  const endKey = getGymDateKey(new Date(Date.now() + 86400000));
  const submit = await submitLeave(ashTok, { startKey, endKey });
  await uploadCertificate(submit.body.leave._id, ashTok);
  const approve = await request('POST', `/api/sick-leaves/${submit.body.leave._id}/approve`, { token: adminTok, body: {} });
  assert.equal(approve.body.coverage.covered, 1);

  // Admin reassigns the covered membership to kit while ash is away.
  const assign = await request('POST', `/api/members/${member.user.id}/assign-trainer`, { token: adminTok, body: { trainerId: kit._id } });
  assert.equal(assign.status, 200, assign.body && assign.body.message);

  // Restore sweep must NOT revert the admin's decision.
  const leave = await TrainerSickLeave.findById(submit.body.leave._id);
  leave.endDate = new Date(Date.now() - 1000);
  await leave.save();
  await reconcileSickLeaves();

  const row = await Membership.findById(membership._id);
  assert.equal(String(row.trainerAssignment.currentTrainer), String(kit._id), 'admin reassignment survives the restore');
});
