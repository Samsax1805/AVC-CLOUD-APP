const express = require('express');
const c = require('../controllers/notices.controller');
const auth = require('../middleware/auth');
const safe = require('../middleware/safe');
const rateLimit = require('../middleware/rateLimit');
const r = express.Router();

const auditLimit = rateLimit({ name: 'audit', windowMs: 60 * 1000, max: 240 });
r.post('/notices', auth, safe(c.post));
r.post('/notices/read', auth, safe(c.readAll));
r.post('/audit', auth, auditLimit, safe(c.audit));

module.exports = r;
