const express = require('express');
const router = express.Router();
const MLPrediction = require('../models/MLPrediction');
const AIInsight = require('../models/AIInsight');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const axios = require('axios');

const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:8001';
const ML_TOKEN = process.env.ML_API_TOKEN || '';

function mlHeaders() {
  if (!ML_TOKEN) return {};
  return { 'X-Api-Key': ML_TOKEN };
}

router.get('/health', auth, async (req, res) => {
  try {
    const response = await axios.get(`${ML_URL}/health`, { timeout: 5000, headers: mlHeaders() });
    if (response.status === 503) {
      res.status(503).json({ mlService: 'degraded', data: response.data });
    } else {
      res.json({ mlService: 'running', data: response.data });
    }
  } catch (error) {
    if (error.response && error.response.status === 503) {
      res.status(503).json({ mlService: 'degraded', data: error.response.data });
    } else {
      res.json({ mlService: 'offline', error: 'ML service not reachable' });
    }
  }
});

router.post('/predict/segment', auth, authorize('admin'), async (req, res) => {
  try {
    const response = await axios.post(`${ML_URL}/predict/segment`, req.body, { timeout: 30000, headers: mlHeaders() });
    if (response.data.memberId) {
      await MLPrediction.create({
        member: response.data.memberId,
        model: 'segmentation',
        prediction: response.data.segment,
        probability: response.data.confidence,
        features: response.data.features,
        reason: `Member classified as ${response.data.segment}`
      });
    }
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ message: 'ML service error' });
  }
});

router.post('/predict/segment-all', auth, authorize('admin'), async (req, res) => {
  try {
    const response = await axios.post(`${ML_URL}/predict/segment-all`, {}, { timeout: 60000, headers: mlHeaders() });
    if (Array.isArray(response.data.predictions)) {
      for (const pred of response.data.predictions) {
        await MLPrediction.findOneAndUpdate(
          { member: pred.memberId, model: 'segmentation' },
          {
            member: pred.memberId,
            model: 'segmentation',
            prediction: pred.segment,
            probability: pred.confidence,
            features: pred.features,
            reason: `Member classified as ${pred.segment}`
          },
          { upsert: true, new: true }
        );
      }
    }
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ message: 'ML service error' });
  }
});

router.post('/predict/engagement-risk', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const response = await axios.post(`${ML_URL}/predict/engagement-risk`, req.body, { timeout: 30000, headers: mlHeaders() });
    if (response.data.memberId) {
      await MLPrediction.findOneAndUpdate(
        { member: response.data.memberId, model: 'engagement_risk' },
        {
          member: response.data.memberId,
          model: 'engagement_risk',
          prediction: response.data.riskLevel,
          probability: response.data.probability,
          riskLevel: response.data.riskLevel,
          reason: response.data.reason
        },
        { upsert: true, new: true }
      );
    }
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ message: 'ML service error' });
  }
});

router.post('/predict/engagement-risk-all', auth, authorize('admin'), async (req, res) => {
  try {
    const response = await axios.post(`${ML_URL}/predict/engagement-risk-all`, {}, { timeout: 60000, headers: mlHeaders() });
    if (Array.isArray(response.data.predictions)) {
      for (const pred of response.data.predictions) {
        await MLPrediction.findOneAndUpdate(
          { member: pred.memberId, model: 'engagement_risk' },
          {
            member: pred.memberId,
            model: 'engagement_risk',
            prediction: pred.riskLevel,
            probability: pred.probability,
            riskLevel: pred.riskLevel,
            reason: pred.reason
          },
          { upsert: true, new: true }
        );
      }
    }
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ message: 'ML service error' });
  }
});

router.post('/predict/progress-anomaly', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const response = await axios.post(`${ML_URL}/predict/progress-anomaly`, req.body, { timeout: 30000, headers: mlHeaders() });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ message: 'ML service error' });
  }
});

router.post('/predict/attendance', auth, authorize('admin'), async (req, res) => {
  try {
    const response = await axios.post(`${ML_URL}/predict/attendance`, req.body, { timeout: 30000, headers: mlHeaders() });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ message: 'ML service error' });
  }
});

router.get('/predictions', auth, authorize('admin', 'trainer'), async (req, res) => {
  try {
    const { model, memberId } = req.query;
    const filter = {};
    if (model) filter.model = model;
    if (memberId) filter.member = memberId;
    const predictions = await MLPrediction.find(filter)
      .populate('member', 'name email')
      .sort({ predictedAt: -1 })
      .limit(100);
    res.json({ predictions });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/insights', auth, async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'member') {
      filter.$or = [{ user: req.user._id }, { user: null }];
    } else if (req.user.role === 'trainer') {
      const MemberProfile = require('../models/MemberProfile');
      const assignedProfiles = await MemberProfile.find({ assignedTrainer: req.user._id }).select('user');
      const assignedIds = assignedProfiles.map((p) => p.user);
      filter.$or = [
        { user: { $in: assignedIds } },
        { user: null }
      ];
    }
    const insights = await AIInsight.find(filter).sort({ createdAt: -1 }).limit(50);
    res.json({ insights });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
