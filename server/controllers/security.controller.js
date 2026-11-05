const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const SecurityEvent = require('../models/SecurityEvent');
const security = require('../services/security.service');
const { sign } = require('../config/token');

const VIEWERS = ['admin', 'president'];
const OFFICER_ROLES = ['admin', 'president', 'secretary', 'provost', 'pro', 'custodian', 'electoral'];
const canView = (req) => !(req.user.roles || []).includes('alumni') && (req.user.roles || []).some((r) => VIEWERS.includes(r));
const signInMethods = (u) => [u.googleId && 'Google', u.passwordHash && 'Password'].filter(Boolean);
const clean = ({ _id, __v, ...e }) => ({ id: _id.toString(), ...e });

const loadTarget = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(404).json({ msg: 'Member not found' }); return null; }
  const user = await User.findById(req.params.id);
  if (!user) { res.status(404).json({ msg: 'Member not found' }); return null; }
  return user;
};

// GET /api/security — the Security page (Admin and President)
exports.overview = async (req, res) => {
  if (!canView(req)) return res.status(403).json({ msg: 'Only the Admin or President can view security' });
  const now = new Date();
  const [events, users] = await Promise.all([
    SecurityEvent.find({}).sort({ createdAt: -1 }).limit(1000).lean(),
    User.find({}, { name: 1, email: 1, roles: 1, status: 1, googleId: 1, passwordHash: 1, lastLoginAt: 1, lockedUntil: 1 }).lean(),
  ]);
  const account = (u) => ({
    id: u._id.toString(), name: u.name, email: u.email, roles: u.roles || ['member'], status: u.status,
    lastLoginAt: u.lastLoginAt || null, methods: signInMethods(u), lockedUntil: u.lockedUntil > now ? u.lockedUntil : null,
  });
  const active = users.filter((u) => u.status === 'active');
  res.json({
    events: events.map(clean),
    officers: active.filter((u) => (u.roles || []).some((r) => OFFICER_ROLES.includes(r))).map(account),
    locked: users.filter((u) => u.lockedUntil > now).map(account),
    members: active.map(account),
  });
};

// POST /api/security/users/:id/signout — ends every session of that account (e.g. a lost phone)
exports.signOutUser = async (req, res) => {
  if (!canView(req)) return res.status(403).json({ msg: 'Only the Admin or President can do this' });
  const user = await loadTarget(req, res);
  if (!user) return;
  if ((user.roles || []).includes('admin') && !(req.user.roles || []).includes('admin')) return res.status(403).json({ msg: 'Only an admin can sign out an admin' });
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  await security.recordAction(req, 'signed_out_everywhere', user, 'Signed out on all devices');
  res.json({ ok: true });
};

// POST /api/security/users/:id/unlock — lifts a lock from too many wrong passwords
exports.unlockUser = async (req, res) => {
  if (!canView(req)) return res.status(403).json({ msg: 'Only the Admin or President can do this' });
  const user = await loadTarget(req, res);
  if (!user) return;
  user.lockedUntil = null;
  user.failedLogins = 0;
  await user.save();
  await security.recordAction(req, 'unlocked', user, 'Account unlocked');
  res.json({ ok: true });
};

// GET /api/security/me — a member's own recent sign-ins (Settings)
exports.mine = async (req, res) => {
  const [user, events] = await Promise.all([
    User.findById(req.user.id, { passwordHash: 1, googleId: 1 }).lean(),
    SecurityEvent.find({ kind: 'signin', userId: req.user.id }).sort({ createdAt: -1 }).limit(8).lean(),
  ]);
  if (!user) return res.status(404).json({ msg: 'User not found' });
  res.json({ hasPassword: !!user.passwordHash, google: !!user.googleId, signins: events.map(clean) });
};

// POST /api/security/me/password { current, next } — signs out every other device; this one gets a new token
exports.changePassword = async (req, res) => {
  const { current = '', next = '' } = req.body || {};
  if (String(next).length < 6) return res.status(400).json({ msg: 'The new password must be at least 6 characters' });
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ msg: 'User not found' });
  if (user.passwordHash && !bcrypt.compareSync(String(current), user.passwordHash)) return res.status(400).json({ msg: 'Your current password is not correct' });
  const first = !user.passwordHash;
  user.passwordHash = bcrypt.hashSync(String(next), 10);
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.failedLogins = 0;
  user.lockedUntil = null;
  await user.save();
  await security.record(req, { kind: 'action', type: 'password_changed', userId: user._id.toString(), name: user.name, email: user.email, actorId: user._id.toString(), actorName: user.name, detail: first ? 'Set a password' : 'Changed their password' });
  res.json({ ok: true, access: sign(user) });
};

// POST /api/security/me/signout-others — this device stays signed in with a new token
exports.signOutOthers = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ msg: 'User not found' });
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  await security.record(req, { kind: 'action', type: 'signed_out_everywhere', userId: user._id.toString(), name: user.name, email: user.email, actorId: user._id.toString(), actorName: user.name, detail: 'Signed out of their other devices' });
  res.json({ ok: true, access: sign(user) });
};
