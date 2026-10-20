const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
    const authorization = req.headers.authorization || '';
    const token = req.headers['x-auth-token'] || (authorization.startsWith('Bearer ') ? authorization.slice(7) : null);
    if (!token) {
        return res.status(401).json({ error: 'Not authorized, no token' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id).select('-password');
        if (!req.user) return res.status(401).json({ error: 'Not authorized, user not found' });
        return next();
    } catch (error) {
        return res.status(401).json({ error: 'Not authorized, token failed' });
    }
};

module.exports = protect;
