const express = require('express');
const c = require('../controllers/auth.controller');
const auth = require('../middleware/auth');
const r = express.Router();

r.post('/login', c.login);
// Password-less demo login: local development only, never in production
if (process.env.NODE_ENV !== 'production') r.post('/demo', c.demo);
r.post('/register', c.register);
r.post('/google', c.google);
r.post('/section', auth, c.section);
r.patch('/profile', auth, c.profile);
r.get('/me', auth, c.me);
r.post('/forgot-password', c.forgotPassword);
r.post('/verify-reset-code', c.verifyResetCode);
r.post('/reset-password', c.resetPassword);

module.exports = r;