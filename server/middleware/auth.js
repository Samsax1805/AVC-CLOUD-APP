const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Valid token AND a still-active account: deactivated or pending members lose access immediately
module.exports = async (req, res, next) => {
  const token = req.headers['x-auth-token'] || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); }
  catch { return res.status(401).json({ msg: 'Token is not valid' }); }
  const user = await User.findById(req.user.id, { status: 1, roles: 1 }).lean().catch(() => null);
  if (!user || user.status !== 'active') return res.status(401).json({ msg: 'Account is not active' });
  req.user.roles = user.roles || ['member'];
  next();
};