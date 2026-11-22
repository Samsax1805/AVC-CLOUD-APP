const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const SecurityEvent = require('../models/SecurityEvent');
const security = require('../services/security.service');
const { sign } = require('../config/token');

const VIEWERS = ['admin', 'president'];
const OFFICER_ROLES = ['admin', 'president', 'secretary', 'finance', 'provost', 'pro', 'choirmaster', 'asstchoirmaster', 'custodian', 'electoral'];
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

/* ---------------- The admin role: hand over, remove or give up, always confirmed ---------------- */
// Changing who is admin is the most powerful thing on the site, so it never happens from an ordinary
// save. The admin confirms with their password (or, for a Google-only account, a code emailed to them),
// and must leave at least one other active admin. Every change is logged and emailed to all admins.
const crypto = require('crypto');
const { Misc } = require('../models/records');
const { isSystem } = require('../config/system');
const emailService = require('../services/email.service');
const codes = new Map(); // userId → { hash, exp, tries } (one server process)
const isAdmin = (req) => !(req.user.roles || []).includes('alumni') && (req.user.roles || []).includes('admin');
const today = () => new Date().toISOString().slice(0, 10);
const addHistory = async (userId, role, granted) => {
  const cur = await Misc.findOne({ key: 'roleHistory' }).lean();
  const list = Array.isArray(cur?.data) ? cur.data : [];
  const next = granted
    ? [{ id: `rh-${crypto.randomUUID().slice(0, 8)}`, userId, role, granted: today(), revoked: null }, ...list]
    : list.map((h) => (h.userId === userId && h.role === role && !h.revoked ? { ...h, revoked: today() } : h));
  await Misc.updateOne({ key: 'roleHistory' }, { key: 'roleHistory', data: next }, { upsert: true });
};

// POST /api/security/admin-role/code — for an admin who signs in with Google only (no password)
exports.adminCode = async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ msg: 'Only an admin can do this' });
  const me = await User.findById(req.user.id);
  if (!me) return res.status(404).json({ msg: 'User not found' });
  if (me.passwordHash) return res.status(400).json({ msg: 'Confirm with your password instead' });
  const prev = codes.get(req.user.id);
  if (prev && prev.exp - Date.now() > 9 * 60000) return res.json({ ok: true, sent: true }); // one a minute
  const code = crypto.randomInt(100000, 1000000).toString();
  codes.set(req.user.id, { hash: bcrypt.hashSync(code, 10), exp: Date.now() + 10 * 60000, tries: 0 });
  await emailService.sendSecurityAlert([me.email], 'Your confirmation code for an admin change', [`Your code is ${code}. It works for 10 minutes.`, 'If you did not ask to change who is admin on the choir website, do not share it and check the Security page.']);
  res.json({ ok: true, sent: true });
};

// POST /api/security/admin-role { action: 'grant' | 'revoke', userId, password | code, confirm }
//   grant: make a member an admin (succession).  revoke: remove another admin, or give up your own role.
exports.adminRole = async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ msg: 'Only an admin can change who is admin' });
  const { action, userId, password, code, confirm } = req.body || {};
  if (!['grant', 'revoke'].includes(action) || typeof userId !== 'string') return res.status(400).json({ msg: 'Invalid request' });
  const word = action === 'grant' ? 'GRANT' : String(userId) === req.user.id ? 'FORFEIT' : 'REMOVE';
  if (String(confirm || '').trim().toUpperCase() !== word) return res.status(400).json({ msg: `Type ${word} to confirm` });

  // 1. Prove it is really the admin
  const me = await User.findById(req.user.id);
  if (!me) return res.status(404).json({ msg: 'User not found' });
  const fail = async (msg) => {
    await security.record(req, { kind: 'action', type: 'admin_change_refused', alert: true, userId: me._id.toString(), name: me.name, email: me.email, actorId: me._id.toString(), actorName: me.name, detail: `Admin change refused: ${msg}` });
    return res.status(401).json({ msg });
  };
  if (me.passwordHash) {
    if (typeof password !== 'string' || !bcrypt.compareSync(password, me.passwordHash)) return fail('Your password is not correct');
  } else {
    const c = codes.get(req.user.id);
    if (!c || c.exp < Date.now()) return fail('Ask for a new confirmation code');
    if (typeof code !== 'string' || !bcrypt.compareSync(code, c.hash)) {
      c.tries += 1; if (c.tries >= 5) codes.delete(req.user.id);
      return fail('The confirmation code is not correct');
    }
    codes.delete(req.user.id);
  }

  // 2. Check the change is allowed
  if (!mongoose.isValidObjectId(userId)) return res.status(404).json({ msg: 'Member not found' });
  const target = await User.findById(userId);
  if (!target) return res.status(404).json({ msg: 'Member not found' });
  const roles = target.roles || [];
  if (action === 'grant') {
    if (target.status !== 'active') return res.status(400).json({ msg: 'Only an active member can become an admin' });
    if (roles.includes('alumni')) return res.status(400).json({ msg: 'An Old Member cannot be an admin' });
    if (roles.includes('admin')) return res.status(400).json({ msg: `${target.name} is already an admin` });
    target.roles = ['admin', ...roles.filter((r) => r !== 'member')];
  } else {
    if (!roles.includes('admin')) return res.status(400).json({ msg: `${target.name} is not an admin` });
    const others = await User.countDocuments({ _id: { $ne: target._id }, status: 'active', roles: 'admin' });
    if (!others) return res.status(400).json({ msg: 'Make another member an admin first: the site must always have at least one admin' });
    const left = roles.filter((r) => r !== 'admin');
    target.roles = left.length ? left : (isSystem(target) ? [] : ['member']);
  }
  await target.save();
  await addHistory(target._id.toString(), 'admin', action === 'grant');

  // 3. Record it and tell every admin (the old and the new)
  const self = target._id.toString() === me._id.toString();
  const what = action === 'grant' ? `Made ${target.name} an admin` : self ? `${me.name} gave up the admin role` : `Removed the admin role from ${target.name}`;
  await security.record(req, { kind: 'action', type: action === 'grant' ? 'role_granted' : 'role_revoked', alert: true, userId: target._id.toString(), name: target.name, email: target.email, actorId: me._id.toString(), actorName: me.name, detail: `${what} (confirmed with ${me.passwordHash ? 'password' : 'emailed code'})` });
  const notify = await User.find({ status: 'active', roles: 'admin' }, { email: 1 }).lean();
  const to = [...new Set([...notify.map((a) => a.email), me.email, target.email])];
  emailService.sendSecurityAlert(to, `Admin change: ${what}`, [`${what} on the choir website, confirmed by ${me.name}.`, 'If this was not expected, check the Security page straight away.']);
  res.json({ ok: true, roles: target.roles, self });
};
