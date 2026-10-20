const express = require('express');
const TrainerSickLeave = require('../models/TrainerSickLeave');
const { auth, authorize } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { bulkCreateNotifications } = require('../utils/notify');
const {
  getGymDayStartOnDateKey,
  getGymDayEnd,
  getGymDateKey
} = require('../utils/gymTime');
const {
  writeMedicalCertificate,
  readMedicalCertificate,
  certificateMetadata,
  deleteMedicalCertificate,
  createCertificateMulter,
  handleCertificateMulterError
} = require('../utils/medicalCertificates');
const {
  installCoversForLeave,
  restoreOriginalTrainers
} = require('../utils/sickLeaveCoverage');
const { createUploadLimiter } = require('../utils/uploads');

const router = express.Router();
const certificateMulter = createCertificateMulter();
const uploadLimiter = createUploadLimiter({ max: 10 });

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Public shape of a leave. The on-disk certificate filename is NEVER exposed -
// lists and detail responses only report whether a certificate exists and its
// size/type; bytes are fetched through the audited certificate route.
const serializeLeave = (leave) => {
  const l = leave && leave.toObject ? leave.toObject() : { ...(leave || {}) };
  const cert = l.medicalCertificate || {};
  const entries = (l.coverage && l.coverage.entries) || [];
  const uncovered = (l.coverage && l.coverage.uncovered) || [];
  return {
    _id: l._id,
    trainer: l.trainer,
    startDate: l.startDate,
    endDate: l.endDate,
    reason: l.reason,
    status: l.status,
    submittedAt: l.submittedAt,
    reviewedBy: l.reviewedBy,
    reviewedAt: l.reviewedAt,
    reviewNote: l.reviewNote,
    cancelledAt: l.cancelledAt,
    completedAt: l.completedAt,
    hasCertificate: Boolean(cert.filename),
    certificate: cert.mime ? { mime: cert.mime, size: cert.size, uploadedAt: cert.uploadedAt } : null,
    coverage: {
      installedAt: (l.coverage && l.coverage.installedAt) || null,
      restoredAt: (l.coverage && l.coverage.restoredAt) || null,
      covered: entries.filter((e) => e.replacement).length,
      uncovered: uncovered.length
    },
    createdAt: l.createdAt,
    updatedAt: l.updatedAt
  };
};

const notifyAdmins = async (title, message, data = {}) => {
  const User = require('../models/User');
  const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
  if (admins.length === 0) return;
  await bulkCreateNotifications(
    admins.map((a) => ({ user: a._id, title, message, type: 'trainer_absent', data }))
  );
};

const parseRange = (body) => {
  const startKey = String(body.startDate || '').trim().slice(0, 10);
  const endKey = String(body.endDate || '').trim().slice(0, 10);
  if (!DATE_KEY_RE.test(startKey) || !DATE_KEY_RE.test(endKey)) return null;
  if (endKey < startKey) return null;
  // Inclusive gym-local days: [00:00 of start day, 00:00 of the day AFTER the
  // end day) - the stored endDate is the exclusive bound used by reconcile.
  return {
    startKey,
    endKey,
    startDate: getGymDayStartOnDateKey(startKey),
    endDate: getGymDayEnd(getGymDayStartOnDateKey(endKey))
  };
};

// ---------------------------------------------------------------------------
// Trainer: submit a leave (certificate optional at this stage)
// ---------------------------------------------------------------------------
router.post('/', uploadLimiter, auth, authorize('trainer'), (req, res) => {
  certificateMulter.single('certificate')(req, res, async (err) => {
    try {
      if (err) return handleCertificateMulterError(err, res);

      const range = parseRange(req.body);
      if (!range) return res.status(400).json({ message: 'startDate and endDate must be YYYY-MM-DD with endDate on or after startDate' });
      const reason = String(req.body.reason || '').trim();
      if (!reason) return res.status(400).json({ message: 'reason is required' });
      if (range.startKey < getGymDateKey()) {
        return res.status(400).json({ message: 'startDate cannot be in the past' });
      }

      const overlap = await TrainerSickLeave.findOne({
        trainer: req.user._id,
        status: { $in: ['PENDING', 'APPROVED'] },
        startDate: { $lte: range.endDate },
        endDate: { $gte: range.startDate }
      }).select('_id').lean();
      if (overlap) {
        return res.status(409).json({ message: 'You already have a pending or approved leave overlapping these dates' });
      }

      let certificate = { filename: '', mime: '', size: 0, uploadedAt: null };
      if (req.file) {
        const stored = writeMedicalCertificate(req.file.buffer);
        if (!stored) {
          return res.status(400).json({ message: 'Certificate must be a JPEG, PNG or PDF within the size limit' });
        }
        certificate = { filename: stored.filename, mime: stored.mime, size: stored.size, uploadedAt: new Date() };
      }

      let leave;
      try {
        leave = await TrainerSickLeave.create({
          trainer: req.user._id,
          startDate: range.startDate,
          endDate: range.endDate,
          reason,
          medicalCertificate: certificate
        });
      } catch (createError) {
        if (certificate.filename) deleteMedicalCertificate(certificate.filename);
        if (createError && createError.name === 'ValidationError') {
          return res.status(400).json({ message: createError.message });
        }
        throw createError;
      }

      await logAudit({
        actor: req.user._id,
        user: req.user._id,
        action: 'created',
        entity: 'TrainerSickLeave',
        entityId: leave._id,
        reason: 'trainer submitted sick leave request',
        metadata: { startKey: range.startKey, endKey: range.endKey, hasCertificate: Boolean(certificate.filename) }
      });
      await notifyAdmins(
        'Sick leave request submitted',
        'A trainer has submitted a sick leave request that needs review.',
        { sickLeaveId: String(leave._id) }
      );

      return res.status(201).json({ leave: serializeLeave(leave) });
    } catch (error) {
      return res.status(500).json({ message: error.message || 'Server error' });
    }
  });
});

// ---------------------------------------------------------------------------
// Trainer: attach / replace the certificate on own leave
// ---------------------------------------------------------------------------
router.post('/:id/certificate', uploadLimiter, auth, authorize('trainer'), (req, res) => {
  certificateMulter.single('certificate')(req, res, async (err) => {
    try {
      if (err) return handleCertificateMulterError(err, res);
      if (!req.file) return res.status(400).json({ message: 'certificate file is required' });

      const leave = await TrainerSickLeave.findById(req.params.id);
      if (!leave) return res.status(404).json({ message: 'Leave not found' });
      if (String(leave.trainer) !== String(req.user._id)) {
        return res.status(403).json({ message: 'You can only manage your own sick leaves' });
      }
      if (!['PENDING', 'APPROVED'].includes(leave.status)) {
        return res.status(400).json({ message: 'Certificate can only be changed while the leave is pending or approved' });
      }

      const stored = writeMedicalCertificate(req.file.buffer);
      if (!stored) {
        return res.status(400).json({ message: 'Certificate must be a JPEG, PNG or PDF within the size limit' });
      }
      const previous = leave.medicalCertificate && leave.medicalCertificate.filename;
      leave.medicalCertificate = { filename: stored.filename, mime: stored.mime, size: stored.size, uploadedAt: new Date() };
      await leave.save();
      if (previous) deleteMedicalCertificate(previous);

      await logAudit({
        actor: req.user._id,
        user: leave.trainer,
        action: 'certificate_uploaded',
        entity: 'TrainerSickLeave',
        entityId: leave._id,
        reason: 'medical certificate attached to sick leave'
      });

      return res.json({ leave: serializeLeave(leave) });
    } catch (error) {
      return res.status(500).json({ message: error.message || 'Server error' });
    }
  });
});

// ---------------------------------------------------------------------------
// Certificate download - authenticated + audited, never statically served
// ---------------------------------------------------------------------------
router.get('/:id/certificate', auth, authorize('trainer', 'admin'), async (req, res) => {
  try {
    const leave = await TrainerSickLeave.findById(req.params.id);
    if (!leave) return res.status(404).json({ message: 'Leave not found' });
    const isOwner = String(leave.trainer) === String(req.user._id);
    if (req.user.role !== 'admin' && !isOwner) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const filename = leave.medicalCertificate && leave.medicalCertificate.filename;
    const meta = filename ? certificateMetadata(filename) : null;
    if (!meta) return res.status(404).json({ message: 'No certificate on file' });
    const bytes = readMedicalCertificate(filename);
    if (!bytes) return res.status(404).json({ message: 'Certificate file is unavailable' });

    await logAudit({
      actor: req.user._id,
      user: leave.trainer,
      action: 'certificate_viewed',
      entity: 'TrainerSickLeave',
      entityId: leave._id,
      reason: 'medical certificate accessed'
    });

    res.setHeader('Content-Type', meta.mime);
    res.setHeader('Content-Length', meta.size);
    res.setHeader('Content-Disposition', `inline; filename="medical-certificate.${meta.mime === 'application/pdf' ? 'pdf' : meta.mime === 'image/png' ? 'png' : 'jpg'}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(bytes);
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------
router.get('/mine', auth, authorize('trainer'), async (req, res) => {
  try {
    const leaves = await TrainerSickLeave.find({ trainer: req.user._id }).sort({ createdAt: -1 }).limit(100);
    res.json({ leaves: leaves.map(serializeLeave) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/', auth, authorize('admin'), async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = String(req.query.status).toUpperCase();
    if (req.query.trainer) filter.trainer = req.query.trainer;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const [total, leaves] = await Promise.all([
      TrainerSickLeave.countDocuments(filter),
      TrainerSickLeave.find(filter)
        .populate('trainer', 'name email')
        .populate('reviewedBy', 'name')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
    ]);
    res.json({ leaves: leaves.map(serializeLeave), total, page, limit });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', auth, authorize('trainer', 'admin'), async (req, res) => {
  try {
    const leave = await TrainerSickLeave.findById(req.params.id)
      .populate('trainer', 'name email')
      .populate('reviewedBy', 'name');
    if (!leave) return res.status(404).json({ message: 'Leave not found' });
    if (req.user.role !== 'admin' && String(leave.trainer._id || leave.trainer) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    res.json({ leave: serializeLeave(leave) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// Admin: approve / reject
// ---------------------------------------------------------------------------
router.post('/:id/approve', auth, authorize('admin'), async (req, res) => {
  try {
    const leave = await TrainerSickLeave.findById(req.params.id);
    if (!leave) return res.status(404).json({ message: 'Leave not found' });
    if (String(leave.trainer) === String(req.user._id)) {
      return res.status(403).json({ message: 'You cannot approve your own sick leave' });
    }
    if (leave.status !== 'PENDING') {
      return res.status(400).json({ message: `Only pending leaves can be approved (current: ${leave.status})` });
    }

    // Medical certificate is mandatory to approve - it must exist as real
    // bytes in the private store, not just as metadata.
    const filename = leave.medicalCertificate && leave.medicalCertificate.filename;
    if (!filename || !certificateMetadata(filename)) {
      return res.status(400).json({ message: 'A medical certificate is required before this leave can be approved' });
    }

    leave.status = 'APPROVED';
    leave.reviewedBy = req.user._id;
    leave.reviewedAt = new Date();
    leave.reviewNote = String(req.body && req.body.note ? req.body.note : '');
    await leave.save();

    // A leave that already started gets its temporary covers right now; a
    // future-dated leave is covered by the reconcile sweep on its start day.
    let coverage = { covered: 0, uncovered: 0 };
    if (leave.startDate <= new Date()) {
      coverage = await installCoversForLeave(leave, { actor: req.user._id });
    }

    await logAudit({
      actor: req.user._id,
      user: leave.trainer,
      action: 'approved',
      entity: 'TrainerSickLeave',
      entityId: leave._id,
      reason: 'sick leave approved',
      metadata: { covered: coverage.covered, uncovered: coverage.uncovered }
    });
    await bulkCreateNotifications([{
      user: leave.trainer,
      title: 'Sick leave approved',
      message: 'Your sick leave request has been approved. A temporary trainer covers your members meanwhile.',
      type: 'trainer_assignment',
      data: { sickLeaveId: String(leave._id) }
    }]);

    res.json({ leave: serializeLeave(leave), coverage });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

router.post('/:id/reject', auth, authorize('admin'), async (req, res) => {
  try {
    const leave = await TrainerSickLeave.findById(req.params.id);
    if (!leave) return res.status(404).json({ message: 'Leave not found' });
    if (String(leave.trainer) === String(req.user._id)) {
      return res.status(403).json({ message: 'You cannot review your own sick leave' });
    }
    if (leave.status !== 'PENDING') {
      return res.status(400).json({ message: `Only pending leaves can be rejected (current: ${leave.status})` });
    }

    leave.status = 'REJECTED';
    leave.reviewedBy = req.user._id;
    leave.reviewedAt = new Date();
    leave.reviewNote = String(req.body && req.body.note ? req.body.note : '').slice(0, 500);
    await leave.save();

    await logAudit({
      actor: req.user._id,
      user: leave.trainer,
      action: 'rejected',
      entity: 'TrainerSickLeave',
      entityId: leave._id,
      reason: 'sick leave rejected',
      metadata: { note: leave.reviewNote }
    });
    await bulkCreateNotifications([{
      user: leave.trainer,
      title: 'Sick leave rejected',
      message: leave.reviewNote ? `Your sick leave request was rejected: ${leave.reviewNote}` : 'Your sick leave request was rejected.',
      type: 'trainer_absent',
      data: { sickLeaveId: String(leave._id) }
    }]);

    res.json({ leave: serializeLeave(leave) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// Trainer (or admin): withdraw - restores any installed coverage first
// ---------------------------------------------------------------------------
router.post('/:id/cancel', auth, authorize('trainer', 'admin'), async (req, res) => {
  try {
    const leave = await TrainerSickLeave.findById(req.params.id);
    if (!leave) return res.status(404).json({ message: 'Leave not found' });
    const isOwner = String(leave.trainer) === String(req.user._id);
    if (req.user.role !== 'admin' && !isOwner) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (!['PENDING', 'APPROVED'].includes(leave.status)) {
      return res.status(400).json({ message: `Leave cannot be cancelled from status ${leave.status}` });
    }

    const hadCoverage = leave.status === 'APPROVED'
      && leave.coverage
      && Array.isArray(leave.coverage.entries)
      && leave.coverage.entries.some((e) => e.replacement);
    if (hadCoverage) {
      await restoreOriginalTrainers(leave, { actor: req.user._id, note: 'leave cancelled before it ended' });
    }

    leave.status = 'CANCELLED';
    leave.cancelledAt = new Date();
    if (req.user.role === 'admin') {
      leave.reviewedBy = leave.reviewedBy || req.user._id;
      leave.reviewedAt = leave.reviewedAt || new Date();
    }
    await leave.save();

    await logAudit({
      actor: req.user._id,
      user: leave.trainer,
      action: 'cancelled',
      entity: 'TrainerSickLeave',
      entityId: leave._id,
      reason: 'sick leave cancelled',
      metadata: { restoredCoverage: hadCoverage }
    });
    await notifyAdmins(
      'Sick leave cancelled',
      'A trainer has cancelled their sick leave request.',
      { sickLeaveId: String(leave._id) }
    );
    if (!isOwner) {
      await bulkCreateNotifications([{
        user: leave.trainer,
        title: 'Sick leave cancelled',
        message: 'Your sick leave request has been cancelled by an administrator.',
        type: 'trainer_absent',
        data: { sickLeaveId: String(leave._id) }
      }]);
    }

    res.json({ leave: serializeLeave(leave) });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

module.exports = router;
module.exports.serializeLeave = serializeLeave;
