const jwt = require('jsonwebtoken');
module.exports = (req, res, next) => {
  const token = req.headers['x-auth-token'] || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ msg: 'Token is not valid' }); }
};