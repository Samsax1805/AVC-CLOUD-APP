const express = require('express');
const c = require('../controllers/attendance.controller');
const auth = require('../middleware/auth');
const safe = require('../middleware/safe');
const rateLimit = require('../middleware/rateLimit');
const r = express.Router();

// Generous: a whole choir checks in from the church Wi-Fi within a few minutes
const checkinLimit = rateLimit({ name: 'checkin', windowMs: 10 * 60 * 1000, max: 300 });
r.post('/qr', auth, safe(c.qr));
r.post('/checkin', auth, checkinLimit, safe(c.checkin));

module.exports = r;
