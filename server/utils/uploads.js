'use strict';

// Shared secure image-upload helpers.
//
// Uploads are buffered in memory (bounded by `maxBytes`) so the file size is
// enforced BEFORE anything is written to disk, the file content is validated
// against its magic bytes (never trusting the client Content-Type or the file
// name extension), and the stored filename is a random non-guessable hex id
// that leaks no user identity (no ObjectId, email, name or timestamp).
//
// Only the image formats the application genuinely renders are accepted:
// JPEG, PNG, WebP and GIF.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const rateLimit = require('express-rate-limit');

const AVATARS_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
const PHOTOS_DIR = path.join(__dirname, '..', 'uploads', 'photos');
fs.mkdirSync(AVATARS_DIR, { recursive: true });
fs.mkdirSync(PHOTOS_DIR, { recursive: true });

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// Size caps are configurable via environment (value in megabytes).
const parseMaxBytes = (envKey, defaultMB) => {
  const raw = process.env[envKey];
  if (!raw) return defaultMB * 1024 * 1024;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1024 * 1024) : defaultMB * 1024 * 1024;
};

const AVATAR_MAX_BYTES = parseMaxBytes('AVATAR_MAX_SIZE_MB', 2);
const AVATAR_MAX_MB = AVATAR_MAX_BYTES / (1024 * 1024);
const PHOTO_MAX_BYTES = parseMaxBytes('PHOTO_MAX_SIZE_MB', 5);
const PHOTO_MAX_MB = PHOTO_MAX_BYTES / (1024 * 1024);

// Sniff the actual image format from the leading bytes. Returns
// { mime, ext } for a genuinely supported image, otherwise null.
const sniffImageFormat = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 3) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.length >= 8 && buffer.subarray(0, 8).compare(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) === 0) {
    return { mime: 'image/png', ext: 'png' };
  }
  // GIF: GIF87a or GIF89a
  const head = buffer.subarray(0, 6).toString('ascii');
  if (head === 'GIF87a' || head === 'GIF89a') {
    return { mime: 'image/gif', ext: 'gif' };
  }
  // WebP: RIFF....WEBP
  if (buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
};

const secureImageFilename = (ext) => `${crypto.randomBytes(24).toString('hex')}.${ext}`;

// Validate the buffer, write it to disk under a secure random name and return
// { filename, absPath, urlPath }. Returns null when the bytes are not a
// supported image (nothing is written in that case).
const writeSecureImage = (buffer, dir) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  const format = sniffImageFormat(buffer);
  if (!format) return null;
  const filename = secureImageFilename(format.ext);
  const absPath = path.join(dir, filename);
  fs.writeFileSync(absPath, buffer);
  return { filename, absPath, urlPath: `/uploads/${path.basename(dir)}/${filename}`, mime: format.mime };
};

// Best-effort, synchronous removal so callers can guarantee "old image gone"
// before responding. Never throws.
const deleteStoredUpload = (absPath) => {
  if (!absPath || typeof absPath !== 'string') return;
  try {
    fs.rmSync(absPath, { force: true });
  } catch {
    // non-fatal: an orphaned file is preferable to a failed request
  }
};

// Multer uses memory storage so size is enforced and content can be sniffed
// before anything is permanently stored. The client-supplied file name is
// never used on disk.
const createImageMulter = (maxBytes) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (req, file, cb) => {
      if (IMAGE_MIME_TYPES.has(file.mimetype)) return cb(null, true);
      cb(new Error('Only JPEG, PNG, WebP or GIF images are allowed'));
    },
  });

const handleMulterError = (err, res, maxMB) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: `Image too large. Maximum allowed size is ${maxMB} MB.` });
  }
  if (err && err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message });
  }
  return res.status(400).json({ message: (err && err.message) || 'Invalid image file' });
};

// Dedicated limiter for upload endpoints (separate from the auth/API bans).
// Disabled under NODE_ENV=test so integration tests are not throttled.
const createUploadLimiter = ({ max = 12, windowMs = 15 * 60 * 1000 } = {}) => {
  if (process.env.NODE_ENV === 'test') return (req, res, next) => next();
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many uploads. Please try again later.' },
  });
};

module.exports = {
  AVATARS_DIR,
  PHOTOS_DIR,
  AVATAR_MAX_BYTES,
  AVATAR_MAX_MB,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_MB,
  IMAGE_MIME_TYPES,
  sniffImageFormat,
  secureImageFilename,
  writeSecureImage,
  deleteStoredUpload,
  createImageMulter,
  handleMulterError,
  createUploadLimiter,
};