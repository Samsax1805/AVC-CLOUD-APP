const express = require('express');
const c = require('../controllers/messages.controller');
const auth = require('../middleware/auth');
const safe = require('../middleware/safe');
const rateLimit = require('../middleware/rateLimit');
const r = express.Router();

const sendLimit = rateLimit({ name: 'messages', windowMs: 60 * 1000, max: 60 });

r.get('/', auth, safe(c.conversations));
r.get('/unread', auth, safe(c.unread));
r.get('/contacts', auth, safe(c.contacts));
r.get('/logs', auth, safe(c.logs));
r.get('/with/:id', auth, safe(c.thread));
r.post('/with/:id', auth, sendLimit, safe(c.send));

module.exports = r;
