const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ProgressPhoto = require('../models/ProgressPhoto');
const { auth, authorize } = require('../middleware/auth');

const uploadDir = path.join(__dirname, '..', 'uploads', 'photos');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `${req.user._id}-${Date.now()}${ext}`);
  }
});

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPEG, PNG, WebP or GIF images are allowed'));
  }
});

const router = express.Router();

router.get('/my', auth, authorize('member'), async (req, res) => {
  try {
    const photos = await ProgressPhoto.find({ user: req.user._id, isActive: true }).sort({ date: -1 });
    res.json({ photos });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/member/:userId', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const photos = await ProgressPhoto.find({ user: req.params.userId, isActive: true }).sort({ date: -1 });
    res.json({ photos });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, authorize('member'), upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Photo is required' });
    const photo = await ProgressPhoto.create({
      user: req.user._id,
      url: `/uploads/photos/${req.file.filename}`,
      caption: req.body.caption,
      angle: req.body.angle || 'other',
      date: req.body.date ? new Date(req.body.date) : new Date()
    });
    res.status(201).json({ photo });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

router.delete('/:id', auth, authorize('member', 'admin', 'trainer'), async (req, res) => {
  try {
    const photo = await ProgressPhoto.findById(req.params.id);
    if (!photo) return res.status(404).json({ message: 'Photo not found' });
    if ((req.user.role === 'member' || req.user.role === 'trainer') && String(photo.user) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only delete your own photos' });
    }
    photo.isActive = false;
    await photo.save();
    const fullPath = path.join(uploadDir, path.basename(photo.url));
    fs.unlink(fullPath, () => {});
    res.json({ message: 'Photo deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;