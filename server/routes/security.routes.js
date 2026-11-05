const express = require('express');
const c = require('../controllers/security.controller');
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const r = express.Router();

const passwordLimit = rateLimit({ name: 'password-change', windowMs: 15 * 60 * 1000, max: 20 });

r.get('/', auth, c.overview);
r.post('/users/:id/signout', auth, c.signOutUser);
r.post('/users/:id/unlock', auth, c.unlockUser);
r.get('/me', auth, c.mine);
r.post('/me/password', auth, passwordLimit, c.changePassword);
r.post('/me/signout-others', auth, c.signOutOthers);

module.exports = r;
