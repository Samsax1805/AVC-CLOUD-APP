const jwt = require('jsonwebtoken');

// Logins last 7 days. Anyone using the site in the last 3 of those days gets a fresh token,
// so only people away for longer than that have to log in again.
const SESSION_LENGTH = '7d';
const RENEW_WITHIN_SECONDS = 3 * 24 * 60 * 60;

// tv must match the account's tokenVersion; raising it ends every session (see middleware/auth.js)
const sign = (u) => jwt.sign({ id: u._id.toString(), roles: u.roles, tv: u.tokenVersion || 0 }, process.env.JWT_SECRET, { expiresIn: SESSION_LENGTH });

module.exports = { sign, RENEW_WITHIN_SECONDS };
