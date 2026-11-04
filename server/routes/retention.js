'use strict';

const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const { getTrainerAccessibleMemberIds } = require('../utils/access');
const {
  THRESHOLDS,
  buildRetentionMembers,
  publicRetentionMember
} = require('../utils/retention');

const respond = (res, now, members, { includePayments = true } = {}) => {
  const publicMembers = members.map((member) => publicRetentionMember(member, { includePayments }));
  res.json({
    generatedAt: now.toISOString(),
    count: publicMembers.length,
    thresholds: THRESHOLDS,
    members: publicMembers
  });
};

router.get('/admin/at-risk', auth, authorize('admin'), async (req, res) => {
  try {
    const now = new Date();
    const members = await buildRetentionMembers({ now, includePayments: true });
    respond(res, now, members);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/trainer/alerts', auth, authorize('trainer'), async (req, res) => {
  try {
    const now = new Date();
    const memberIds = await getTrainerAccessibleMemberIds(req.user._id);
    if (memberIds.length === 0) {
      return respond(res, now, []);
    }
    const members = await buildRetentionMembers({
      now,
      memberIds,
      includePayments: false
    });
    respond(res, now, members, { includePayments: false });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
