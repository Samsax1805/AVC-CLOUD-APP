const express = require('express');
const c = require('../controllers/security.controller');
const auth = require('../middleware/auth');
const safe = require('../middleware/safe');
const rateLimit = require('../middleware/rateLimit');
const r = express.Router();

const passwordLimit = rateLimit({ name: 'password-change', windowMs: 15 * 60 * 1000, max: 20 });

r.get('/', auth, safe(c.overview));
r.post('/users/:id/signout', auth, safe(c.signOutUser));
r.post('/users/:id/unlock', auth, safe(c.unlockUser));
r.get('/me', auth, safe(c.mine));
r.post('/me/password', auth, passwordLimit, safe(c.changePassword));
r.post('/me/signout-others', auth, safe(c.signOutOthers));

module.exports = r;
