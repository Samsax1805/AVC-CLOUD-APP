const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const SECRET = process.env.JWT_SECRET || 'changeme';

const publicUser = (u) => ({
  id: u._id ? u._id.toString() : u.id || null,
  name: u.name || '',
  email: u.email || '',
  roles: u.roles || ['member'],
  section: u.section || null,
  avatar: u.avatar || null,
  status: u.status || 'active',
  dob: u.dob || '',
  country: u.country || '',
  phone: u.phone || '',
  provider: u.provider || 'local',
  joined: u.createdAt ? (u.createdAt.toISOString ? u.createdAt.toISOString().slice(0,10) : u.createdAt) : '',
});

const sign = (u) => jwt.sign({ id: u._id ? u._id.toString() : u.id }, SECRET, { expiresIn: '7d' });

exports.register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields are required' });
    if (await User.findOne({ email: (email || '').toLowerCase() })) return res.status(400).json({ error: 'Email already in use' });

    const user = await User.create({ name, email: (email||'').toLowerCase(), phone, password, provider: 'local' });
    const token = sign(user);
    res.status(201).json({ user: publicUser(user), access: token });
  } catch (error) {
    console.error('Register error:', error.message);
    res.status(400).json({ error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const user = await User.findOne({ email: (email || '').toLowerCase() });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });
    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });
    const token = sign(user);
    res.json({ user: publicUser(user), access: token });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(400).json({ error: error.message });
  }
};

// Accepts an ID token from the Google Identity Services client
exports.google = async (req, res) => {
  try {
    const { credential, profile } = req.body || {};
    let payload = null;

    if (credential) {
      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } else if (profile && process.env.NODE_ENV !== 'production') {
      // sandbox fallback for offline/dev flows
      payload = { email: profile.email, name: profile.name, picture: profile.avatarUrl, sub: profile.googleId };
    } else {
      return res.status(400).json({ error: 'Missing Google credential' });
    }

    let user = await User.findOne({ $or: [{ email: payload.email }, { googleId: payload.sub }] });

    if (!user) {
      user = await User.create({
        name: payload.name || (payload.email ? payload.email.split('@')[0] : 'Google User'),
        email: payload.email ? payload.email.toLowerCase() : undefined,
        googleId: payload.sub,
        avatar: payload.picture,
        provider: 'google'
      });
    } else {
      // keep profile in sync
      user.name = payload.name || user.name;
      user.avatar = payload.picture || user.avatar;
      user.googleId = payload.sub || user.googleId;
      user.provider = 'google';
      await user.save();
    }

    const token = sign(user);
    res.json({ user: publicUser(user), access: token });
  } catch (e) {
    console.error('Google auth error:', e && e.message);
    res.status(401).json({ error: 'Google verification failed' });
  }
};

// Used by passport-based server-side OAuth flow
exports.googleCallback = async (req, res) => {
  try {
    const user = req.user;
    const token = sign(user);
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/auth/success?token=${token}`);
  } catch (e) {
    console.error('Google callback error:', e && e.message);
    res.status(500).send('Authentication failed');
  }
};

exports.profile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { name, dob, country, phone, section } = req.body || {};
    if (name !== undefined) user.name = name;
    if (dob !== undefined) user.dob = dob;
    if (country !== undefined) user.country = country;
    if (phone !== undefined) user.phone = phone;
    if (section !== undefined) user.section = section;

    await user.save();
    return res.json({ user: publicUser(user) });
  } catch (error) {
    console.error('Profile update error:', error.message);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
};

exports.section = async (req, res) => {
  try {
    const { section } = req.body || {};
    if (!section) return res.status(400).json({ error: 'Section is required' });
    const user = await User.findByIdAndUpdate(req.user.id, { section }, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: publicUser(user) });
  } catch (error) {
    console.error('Section update error:', error.message);
    return res.status(500).json({ error: 'Failed to update section' });
  }
};

exports.me = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ user: publicUser(user) });
};
