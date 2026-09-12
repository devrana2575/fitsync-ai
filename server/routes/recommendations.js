const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const { getWorkoutRecommendations } = require('../utils/recommendations');

router.get('/my', auth, authorize('member'), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 5, 10);
    const result = await getWorkoutRecommendations(req.user._id, limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/member/:memberId', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 5, 10);
    const result = await getWorkoutRecommendations(req.params.memberId, limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;