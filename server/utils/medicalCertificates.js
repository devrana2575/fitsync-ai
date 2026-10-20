'use strict';

// Private medical-certificate storage for trainer sick leaves.
//
// These files are deliberately NOT under server/uploads (which server.js
// exposes with express.static and which therefore sits on a public path). The
// directory below is outside any static mount; the only way to read a file is
// the authenticated, audited route in routes/trainerSickLeaves.js.
//
// Same discipline as utils/uploads.js: bytes are buffered in memory so the
// size cap is enforced before any disk write, the real format is decided by
// magic bytes (never the client filename/Content-Type), and the on-disk name
// is a random non-guessable id that leaks nothing about the trainer.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const PRIVATE_DIR = path.join(__dirname, '..', 'private', 'medical-certificates');
fs.mkdirSync(PRIVATE_DIR, { recursive: true });

const CERT_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);

const parseMaxBytes = (envKey, defaultMB) => {
  const raw = process.env[envKey];
  if (!raw) return defaultMB * 1024 * 1024;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1024 * 1024) : defaultMB * 1024 * 1024;
};

const CERT_MAX_BYTES = parseMaxBytes('MEDICAL_CERT_MAX_SIZE_MB', 5);
const CERT_MAX_MB = Math.round((CERT_MAX_BYTES / (1024 * 1024)) * 10) / 10;

// Decide the real format from the leading bytes. JPEG, PNG or PDF only -
// nothing else renders in the admin review UI and nothing else is accepted.
const sniffCertificateFormat = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).compare(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) === 0) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { mime: 'application/pdf', ext: 'pdf' };
  }
  return null;
};

// Random, identity-free on-disk name: 48 hex chars + sniffed extension.
const secureCertificateFilename = (ext) => `${crypto.randomBytes(24).toString('hex')}.${ext}`;

// Strict allow-list check before any path join: only our own random hex names
// resolve. Blocks traversal, absolute paths, double extensions, everything.
const resolveCertificatePath = (filename) => {
  if (typeof filename !== 'string') return null;
  if (!/^[a-f0-9]{48}\.(jpg|png|pdf)$/.test(filename)) return null;
  const abs = path.join(PRIVATE_DIR, filename);
  if (path.dirname(abs) !== PRIVATE_DIR) return null;
  return abs;
};

// Validate + write. Returns null (writing nothing) for unsupported bytes.
const writeMedicalCertificate = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  if (buffer.length > CERT_MAX_BYTES) return null;
  const format = sniffCertificateFormat(buffer);
  if (!format) return null;
  const filename = secureCertificateFilename(format.ext);
  const absPath = path.join(PRIVATE_DIR, filename);
  fs.writeFileSync(absPath, buffer);
  return { filename, absPath, mime: format.mime, size: buffer.length };
};

const readMedicalCertificate = (filename) => {
  const abs = resolveCertificatePath(filename);
  if (!abs || !fs.existsSync(abs)) return null;
  return fs.readFileSync(abs);
};

const certificateMetadata = (filename) => {
  const abs = resolveCertificatePath(filename);
  if (!abs || !fs.existsSync(abs)) return null;
  const stat = fs.statSync(abs);
  const ext = path.extname(abs).slice(1).toLowerCase();
  return {
    filename,
    mime: ext === 'jpg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : 'application/pdf',
    size: stat.size
  };
};

// Never throws - an orphaned certificate is preferable to a failed request.
const deleteMedicalCertificate = (filename) => {
  const abs = resolveCertificatePath(filename);
  if (!abs) return;
  try {
    fs.rmSync(abs, { force: true });
  } catch {
    /* best effort */
  }
};

const createCertificateMulter = () =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: CERT_MAX_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
      if (CERT_MIME_TYPES.has(file.mimetype)) return cb(null, true);
      cb(new Error('Only JPEG, PNG or PDF certificates are allowed'));
    }
  });

const handleCertificateMulterError = (err, res) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: `Certificate too large. Maximum allowed size is ${CERT_MAX_MB} MB.` });
  }
  if (err && err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message });
  }
  return res.status(400).json({ message: (err && err.message) || 'Invalid certificate file' });
};

module.exports = {
  PRIVATE_DIR,
  CERT_MAX_BYTES,
  CERT_MAX_MB,
  CERT_MIME_TYPES,
  sniffCertificateFormat,
  secureCertificateFilename,
  resolveCertificatePath,
  writeMedicalCertificate,
  readMedicalCertificate,
  certificateMetadata,
  deleteMedicalCertificate,
  createCertificateMulter,
  handleCertificateMulterError
};
