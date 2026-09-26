const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const SECRET = process.env.JWT_SECRET;

// [FIX] Returns all necessary profile fields to the frontend
const publicUser = (u) => ({
  id: u._id.toString(), 
  name: u.name, 
  email: u.email, 
  roles: u.roles,
  section: u.section || null, 
  avatar: u.avatar || null, 
  status: u.status,
  dob: u.dob || '', 
  country: u.country || '', 
  phone: u.phone || '',
  provider: u.provider || 'local', 
  joined: u.createdAt ? u.createdAt.toISOString().slice(0, 10) : '',
});

const sign = (u) => jwt.sign({ id: u._id.toString(), roles: u.roles }, SECRET, { expiresIn: '7d' });

exports.login = async (req, res) => {
  const { email, password } = req.body || {};
  const user = await User.findOne({ email: (email || '').toLowerCase() });
  if (!user || !user.passwordHash || !bcrypt.compareSync(password || '', user.passwordHash))
    return res.status(401).json({ msg: 'Invalid credentials' });
  if (user.status === 'pending') return res.status(403).json({ msg: 'Account awaiting admin approval' });
  if (user.status === 'deactivated') return res.status(403).json({ msg: 'Account deactivated' });
  res.json({ access: sign(user), user: publicUser(user) });
};

exports.demo = async (req, res) => {
  const user = await User.findOne({ email: (req.body.email || '').toLowerCase() });
  if (!user) return res.status(404).json({ msg: 'Demo account not found' });
  if (user.status !== 'active') return res.status(403).json({ msg: 'Account not active' });
  res.json({ access: sign(user), user: publicUser(user) });
};

// [TESTING MODE] Approval DISABLED — new members are active & logged in immediately.
exports.register = async (req, res) => {
  const { name, phone, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ msg: 'All fields are required' });
  if (await User.findOne({ email: (email || '').toLowerCase() })) return res.status(400).json({ msg: 'Email already registered' });

  const user = await User.create({
    name,
    phone,
    email: email.toLowerCase(),
    passwordHash: bcrypt.hashSync(password, 10),
    roles: ['member'],
    status: 'active',      // [TESTING] was: 'pending' (admin approval)
    provider: 'local',
  });

  // [TESTING] Send a token back so the frontend logs them in straight away
  res.json({ access: sign(user), user: publicUser(user) });
};

/* ================= RESTORE THIS WHEN TESTING IS DONE =================
exports.register = async (req, res) => {
  const { name, phone, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ msg: 'All fields are required' });
  if (await User.findOne({ email: (email || '').toLowerCase() })) return res.status(400).json({ msg: 'Email already registered' });
  await User.create({ name, phone, email: email.toLowerCase(), passwordHash: bcrypt.hashSync(password, 10), roles: ['member'], status: 'pending', provider: 'local' });
  res.json({ success: true, message: 'Registration submitted for approval' });
};
===================================================================== */

exports.google = async (req, res) => {
  try {
    const { credential, profile } = req.body || {};
    let payload = null;
    
    if (credential) {
      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } else if (profile && process.env.NODE_ENV !== 'production') {
      // Fallback for sandbox/offline mode
      payload = { email: profile.email, name: profile.name, picture: profile.avatarUrl, sub: profile.googleId };
    } else {
      return res.status(400).json({ msg: 'Missing Google credential' });
    }

    let user = await User.findOne({ $or: [{ email: payload.email }, { googleId: payload.sub }] });
    
    if (!user) {
      // First Google sign-in → create the account in MongoDB
      user = await User.create({
        name: payload.name || payload.email.split('@')[0],
        email: payload.email,
        googleId: payload.sub,
        avatar: payload.picture,
        roles: ['member'],
        section: null,
        status: 'active',
        provider: 'google', // [FIX] Mark as Google provider so frontend triggers setup
      });
    } else {
      // [FIX] Keep stored profile in sync with Google on every login
      user.name = payload.name || user.name;
      user.avatar = payload.picture || user.avatar;
      user.googleId = payload.sub;
      user.provider = 'google'; 
      await user.save();
    }

    if (user.status !== 'active') return res.status(403).json({ msg: 'Account not active' });
    res.json({ access: sign(user), user: publicUser(user) });
  } catch (e) {
    console.error('Google auth error:', e.message);
    res.status(401).json({ msg: 'Google verification failed' });
  }
};

exports.section = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ msg: 'User not found' });
  user.section = req.body.section;
  await user.save();
  res.json({ user: publicUser(user) });
};

// [NEW] PATCH /api/auth/profile — Save First-Time Setup details
exports.profile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });
    
    const { name, dob, country, phone, section } = req.body || {};
    
    if (name !== undefined) user.name = name;
    if (dob !== undefined) user.dob = dob;
    if (country !== undefined) user.country = country;
    if (phone !== undefined) user.phone = phone;
    if (section !== undefined) user.section = section; // Saves the voice part
    
    await user.save();
    res.json({ user: publicUser(user) });
  } catch (e) {
    console.error('Profile update error:', e.message);
    res.status(500).json({ msg: 'Failed to update profile' });
  }
};

exports.me = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ msg: 'User not found' });
  res.json({ user: publicUser(user) });
};

const ResetCode = require('../models/ResetCode');
const emailService = require('../services/email.service');

// POST /api/auth/forgot-password — generates & emails a 6-digit code
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ msg: 'Email is required' });

    const user = await User.findOne({ email: (email || '').toLowerCase() });
    // [SECURITY] Don't reveal whether the email exists — always return success
    if (!user) {
      console.log('⚠️ Forgot password requested for non-existent email:', email);
      return res.json({ success: true, message: 'If an account exists, a code was sent.' });
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = bcrypt.hashSync(code, 10);

    // Remove any old codes for this email
    await ResetCode.deleteMany({ email: user.email });

    // Store new code (expires in 15 minutes)
    await ResetCode.create({
      email: user.email,
      codeHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    // Try to send email, but don't fail the request if email service is down
    try {
      await emailService.sendResetEmail(user.email, code);
    } catch (emailErr) {
      console.error('⚠️ Email service failed, but code was saved to DB:', emailErr.message);
      // In development, log the code so testing can continue
      if (process.env.NODE_ENV !== 'production') {
        console.log('🔑 DEV MODE — Reset code for', user.email, 'is:', code);
      }
    }
    
    res.json({ success: true, message: 'Reset code sent to your email' });
  } catch (e) {
    console.error('❌ Forgot password error:', e.message);
    res.status(500).json({ msg: 'Failed to process request. Check server logs.' });
  }
};

// POST /api/auth/verify-reset-code — checks the code is valid (optional, UI can skip)
exports.verifyResetCode = async (req, res) => {
  const { email, code } = req.body || {};
  if (!email || !code) return res.status(400).json({ msg: 'Email and code required' });
  const rec = await ResetCode.findOne({ email: (email || '').toLowerCase() }).sort({ createdAt: -1 });
  if (!rec) return res.status(400).json({ msg: 'No reset request found — please try again' });
  if (rec.expiresAt < new Date()) return res.status(400).json({ msg: 'Code expired — request a new one' });
  if (!bcrypt.compareSync(code, rec.codeHash)) return res.status(400).json({ msg: 'Invalid code' });
  res.json({ valid: true });
};

// POST /api/auth/reset-password — sets the new password if code is valid
exports.resetPassword = async (req, res) => {
  const { email, code, newPassword } = req.body || {};
  if (!email || !code || !newPassword) return res.status(400).json({ msg: 'All fields required' });
  if (newPassword.length < 6) return res.status(400).json({ msg: 'Password must be at least 6 characters' });

  const rec = await ResetCode.findOne({ email: (email || '').toLowerCase() }).sort({ createdAt: -1 });
  if (!rec) return res.status(400).json({ msg: 'No reset request found' });
  if (rec.expiresAt < new Date()) return res.status(400).json({ msg: 'Code expired — request a new one' });
  if (!bcrypt.compareSync(code, rec.codeHash)) return res.status(400).json({ msg: 'Invalid code' });

  const user = await User.findOne({ email: (email || '').toLowerCase() });
  if (!user) return res.status(404).json({ msg: 'User not found' });

  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  await user.save();
  await ResetCode.deleteMany({ email: user.email }); // clean up used codes

  res.json({ success: true, message: 'Password reset successfully' });
};