const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const { getTrainingJobs, retrainModels } = require('../utils/mlRetrain');

router.get('/jobs', auth, authorize('admin'), async (req, res) => {
  try {
    const jobs = await getTrainingJobs(Number(req.query.limit) || 20);
    res.json({ jobs });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/retrain', auth, authorize('admin'), async (req, res) => {
  try {
    const job = await retrainModels('manual');
    if (job.status === 'failed') {
      return res.status(500).json({ message: 'Retraining failed', job });
    }
    res.json({ message: 'Retraining completed', job });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

module.exports = router;