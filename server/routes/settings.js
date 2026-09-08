const express = require('express');
const router = express.Router();
const GymSetting = require('../models/GymSetting');
const { auth, authorize } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const settings = await GymSetting.findOne();
    res.json({ settings: settings || {} });
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
    if (timezone !== undefined) payload.timezone = String(timezone);
    if (operatingHours !== undefined) payload.operatingHours = String(operatingHours);

    let settings = await GymSetting.findOne();
    if (!settings) {
      settings = await GymSetting.create(payload);
    } else {
      Object.assign(settings, payload);
      await settings.save();
    }

    res.json({ settings });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;