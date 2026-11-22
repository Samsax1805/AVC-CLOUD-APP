const express = require('express');
const c = require('../controllers/auth.controller');
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const safe = require('../middleware/safe');
const r = express.Router();

// Per network (IP). High enough for a whole choir onboarding together on one church Wi-Fi;
// only blocks automated password guessing. Strict on the 6-digit reset code.
const MIN = 60 * 1000;
const loginLimit = rateLimit({ name: 'login', windowMs: 15 * MIN, max: 200 });
const signupLimit = rateLimit({ name: 'signup', windowMs: 60 * MIN, max: 200 });
const resetLimit = rateLimit({ name: 'reset', windowMs: 15 * MIN, max: 30 });

// Sign-in fields must be plain text: anything else (objects, arrays, numbers) is refused before
// it reaches a database lookup, so a malformed or probing request gets a clean 400, not a crash.
const TEXT_FIELDS = ['email', 'password', 'code', 'newPassword', 'name', 'phone', 'dob'];
const textOnly = (req, res, next) => {
  const body = req.body || {};
  if (TEXT_FIELDS.some((k) => body[k] != null && typeof body[k] !== 'string')) return res.status(400).json({ msg: 'Invalid request' });
  next();
};

r.post('/login', loginLimit, textOnly, safe(c.login));
// Password-less demo login: local development only, never in production
if (process.env.NODE_ENV !== 'production') r.post('/demo', safe(c.demo));
r.post('/register', signupLimit, textOnly, safe(c.register));
r.post('/google', loginLimit, safe(c.google));
r.post('/section', auth, safe(c.section));
r.patch('/profile', auth, safe(c.profile));
r.get('/me', auth, safe(c.me));
r.post('/forgot-password', resetLimit, textOnly, safe(c.forgotPassword));
r.post('/verify-reset-code', resetLimit, textOnly, safe(c.verifyResetCode));
r.post('/reset-password', resetLimit, textOnly, safe(c.resetPassword));

module.exports = r;