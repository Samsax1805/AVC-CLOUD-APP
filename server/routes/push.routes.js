const express = require('express');
const c = require('../controllers/push.controller');
const auth = require('../middleware/auth');
const safe = require('../middleware/safe');
const rateLimit = require('../middleware/rateLimit');
const r = express.Router();

const testLimit = rateLimit({ name: 'push-test', windowMs: 10 * 60 * 1000, max: 10 });
r.get('/key', auth, safe(c.key));
r.post('/subscribe', auth, safe(c.subscribe));
r.post('/unsubscribe', auth, safe(c.unsubscribe));
r.post('/test', auth, testLimit, safe(c.test));

module.exports = r;
