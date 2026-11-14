const express = require('express');
const c = require('../controllers/assistant.controller');
const auth = require('../middleware/auth');
const safe = require('../middleware/safe');
const rateLimit = require('../middleware/rateLimit');
const r = express.Router();

const chatLimit = rateLimit({ name: 'assistant', windowMs: 60 * 1000, max: 40 });

r.get('/', auth, safe(c.get));
r.get('/unread', auth, safe(c.unread));
r.get('/logs', auth, safe(c.logs));
r.post('/', auth, chatLimit, safe(c.send));
r.post('/duties/:num/:action', auth, chatLimit, safe(c.action));

module.exports = r;
