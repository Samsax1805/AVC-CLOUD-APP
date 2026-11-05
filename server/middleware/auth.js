const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sign, RENEW_WITHIN_SECONDS } = require('../config/token');

// Each refusal carries a code so the browser can end the session and return to the login screen
const refuse = (res, code, msg) => res.status(401).json({ msg, code });

// Valid token AND a still-active account: deactivated or pending members lose access immediately
module.exports = async (req, res, next) => {
  const token = req.headers['x-auth-token'] || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return refuse(res, 'NO_TOKEN', 'No token, authorization denied');
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); }
  catch (e) {
    if (e.name === 'TokenExpiredError') return refuse(res, 'SESSION_EXPIRED', 'Your session has expired — please log in again');
    return refuse(res, 'INVALID_TOKEN', 'Token is not valid');
  }
  let user;
  // A database problem is not a login problem: nobody gets logged out because of it
  try { user = await User.findById(req.user.id, { status: 1, roles: 1, tokenVersion: 1 }).lean(); }
  catch (e) {
    console.error('Auth lookup failed:', e.message);
    return res.status(503).json({ msg: 'Service temporarily unavailable — please try again' });
  }
  if (!user || user.status !== 'active') return refuse(res, 'ACCOUNT_INACTIVE', 'Account is not active');
  if ((req.user.tv || 0) !== (user.tokenVersion || 0)) return refuse(res, 'SESSION_REVOKED', 'You were signed out of this device — please log in again');
  req.user.roles = user.roles || ['member'];
  if (req.user.exp - Date.now() / 1000 < RENEW_WITHIN_SECONDS) res.set('x-renewed-token', sign(user));
  next();
};
