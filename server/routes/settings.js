const express = require('express');
const router = express.Router();
const GymSetting = require('../models/GymSetting');
const { auth, authorize } = require('../middleware/auth');
const { setGymTimezone } = require('../utils/gymTime');
const { describePaymentConfig } = require('../utils/paymentConfig');

const isValidTimezone = (tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format();
    return true;
  } catch (error) {
    return false;
  }
};

// Branding data is intentionally public to members/trainers (the sidebar and
// announcements render it). The PUT endpoint is admin-only.
router.get('/', auth, async (req, res) => {
  try {
    const settings = await GymSetting.findOne().lean();
    // Read-only payment method summary - never provider credentials.
    res.json({ settings: settings || {}, payment: describePaymentConfig() });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/', auth, authorize('admin'), async (req, res) => {
  try {
    const { name, address, phone, email, currency, timezone, operatingHours } = req.body;
    const payload = {};
    if (name !== undefined) payload.name = String(name).slice(0, 120);
    if (address !== undefined) payload.address = String(address);
    if (phone !== undefined) payload.phone = String(phone);
    if (email !== undefined) payload.email = String(email);
    if (currency !== undefined) payload.currency = String(currency).toUpperCase().slice(0, 3);
    if (timezone !== undefined) {
      const tz = String(timezone);
      if (!isValidTimezone(tz)) {
        return res.status(400).json({ message: `Invalid timezone: ${tz}` });
      }
      payload.timezone = tz;
    }
    if (operatingHours !== undefined) payload.operatingHours = String(operatingHours);

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ message: 'No settings provided' });
    }

    let settings = await GymSetting.findOne();
    if (!settings) {
      settings = await GymSetting.create(payload);
    } else {
      Object.assign(settings, payload);
      await settings.save();
    }

    // Keep the in-memory gym-timezone cache in sync so all date math uses the
    // freshly configured zone immediately.
    if (payload.timezone) setGymTimezone(payload.timezone);

    res.json({ settings });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;