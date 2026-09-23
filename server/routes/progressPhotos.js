const express = require('express');
const path = require('path');
const ProgressPhoto = require('../models/ProgressPhoto');
const { auth, authorize } = require('../middleware/auth');
const { canTrainerAccessMember } = require('../utils/access');
const {
  PHOTOS_DIR,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_MB,
  createImageMulter,
  handleMulterError,
  writeSecureImage,
  deleteStoredUpload,
  createUploadLimiter,
} = require('../utils/uploads');

const photoMulter = createImageMulter(PHOTO_MAX_BYTES);
const uploadPhotoLimiter = createUploadLimiter({ max: 12 });

const router = express.Router();

router.get('/my', auth, authorize('member'), async (req, res) => {
  try {
    const photos = await ProgressPhoto.find({ user: req.user._id, isActive: true }).sort({ date: -1 }).limit(200).lean();
    res.json({ photos });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/member/:userId', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    // Trainers may only view progress photos of members they coach.
    if (req.user.role === 'trainer') {
      const entitled = await canTrainerAccessMember(req.user._id, req.params.userId);
      if (!entitled) return res.status(403).json({ message: 'Access denied' });
    }
    const photos = await ProgressPhoto.find({ user: req.params.userId, isActive: true }).sort({ date: -1 }).limit(200).lean();
    res.json({ photos });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Secure upload. The photo is buffered in memory and validated (size cap +
// magic-byte sniffing) before anything is written to disk, the stored filename
// is a random non-guessable id, and the photo is always owned by the
// authenticated member (there is no userId/memberId parameter to manipulate).
router.post('/', uploadPhotoLimiter, auth, authorize('member'), (req, res) => {
  photoMulter.single('photo')(req, res, async (err) => {
    try {
      if (err) return handleMulterError(err, res, PHOTO_MAX_MB);
      if (!req.file) return res.status(400).json({ message: 'Photo is required' });

      const stored = writeSecureImage(req.file.buffer, PHOTOS_DIR);
      if (!stored) return res.status(400).json({ message: 'Invalid image file' });

      try {
        const photo = await ProgressPhoto.create({
          user: req.user._id,
          url: stored.urlPath,
          caption: req.body.caption,
          angle: req.body.angle || 'other',
          date: req.body.date ? new Date(req.body.date) : new Date()
        });
        return res.status(201).json({ photo });
      } catch (createError) {
        // Do not leave an orphaned file behind when the DB row cannot be saved.
        deleteStoredUpload(stored.absPath);
        return res.status(500).json({ message: createError.message || 'Server error' });
      }
    } catch (error) {
      res.status(500).json({ message: error.message || 'Server error' });
    }
  });
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
    const fullPath = path.join(PHOTOS_DIR, path.basename(photo.url));
    deleteStoredUpload(fullPath);
    res.json({ message: 'Photo deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;