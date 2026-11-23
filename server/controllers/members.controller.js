const mongoose = require('mongoose');
const User = require('../models/User');
const emailService = require('../services/email.service');
const { mapMember } = require('./data.controller');
const security = require('../services/security.service');

const APPROVERS = ['admin', 'president', 'provost'];
const MANAGERS = ['admin', 'president'];
// Who may add members directly and change the part a member sings
const ADDERS = ['admin', 'president', 'provost', 'pro'];
const PARTS = ['Soprano', 'Alto', 'Tenor', 'Bass'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const has = (req, list) => (req.user.roles || []).some((r) => list.includes(r));

const load = async (req, res, status) => {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(404).json({ msg: 'Member not found' }); return null; }
  const user = await User.findById(req.params.id);
  if (!user || (status && user.status !== status)) { res.status(404).json({ msg: 'Member not found' }); return null; }
  return user;
};

// POST /api/members/:id/approve — President, Provost (and admins)
exports.approve = async (req, res) => {
  if (!has(req, APPROVERS)) return res.status(403).json({ msg: 'Only the President or Provost can approve members' });
  const user = await load(req, res, 'pending');
  if (!user) return;
  user.status = 'active';
  await user.save();
  await security.recordAction(req, 'member_approved', user, 'Registration approved');
  res.json({ ok: true });
};

// POST /api/members/:id/reject — removes a pending registration
exports.reject = async (req, res) => {
  if (!has(req, APPROVERS)) return res.status(403).json({ msg: 'Only the President or Provost can reject members' });
  const user = await load(req, res, 'pending');
  if (!user) return;
  await security.recordAction(req, 'member_rejected', user, 'Registration rejected');
  await user.deleteOne();
  res.json({ ok: true });
};

// POST /api/members/:id/deactivate — member left the choir; their records stay
exports.deactivate = async (req, res) => {
  if (!has(req, MANAGERS)) return res.status(403).json({ msg: 'Only the President or an admin can deactivate members' });
  const user = await load(req, res, 'active');
  if (!user) return;
  if (user._id.toString() === req.user.id) return res.status(400).json({ msg: 'You cannot deactivate your own account' });
  if ((user.roles || []).includes('admin')) {
    if (!has(req, ['admin'])) return res.status(403).json({ msg: 'Only an admin can deactivate another admin' });
    if ((await User.countDocuments({ status: 'active', roles: 'admin' })) <= 1) return res.status(400).json({ msg: 'Cannot deactivate the last admin' });
  }
  user.status = 'deactivated';
  await user.save();
  await security.recordAction(req, 'member_deactivated', user, 'Account deactivated');
  res.json({ ok: true });
};

// POST /api/members/:id/reactivate — grants access back
exports.reactivate = async (req, res) => {
  if (!has(req, MANAGERS)) return res.status(403).json({ msg: 'Only the President or an admin can reactivate members' });
  const user = await load(req, res, 'deactivated');
  if (!user) return;
  user.status = 'active';
  await user.save();
  await security.recordAction(req, 'member_reactivated', user, 'Account reactivated');
  res.json({ ok: true });
};

// POST /api/members — President, Provost or PRO adds a member; the member is emailed how to sign in
exports.add = async (req, res) => {
  if (!has(req, ADDERS)) return res.status(403).json({ msg: 'Only the President, Provost or PRO can add members' });
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 120);
  const email = String(b.email || '').trim().toLowerCase();
  if (!name) return res.status(400).json({ msg: "Enter the member's full name" });
  if (!EMAIL.test(email)) return res.status(400).json({ msg: 'Enter a valid email address' });
  if (b.section && !PARTS.includes(b.section)) return res.status(400).json({ msg: 'Choose Soprano, Alto, Tenor or Bass' });
  const existing = await User.findOne({ email }, { status: 1 }).lean();
  if (existing) {
    return res.status(409).json({ msg: existing.status === 'pending'
      ? 'This email has already registered and is waiting under Pending approvals'
      : 'A member with this email already exists' });
  }
  let user;
  try {
    user = await User.create({
      name, email, phone: String(b.phone || '').slice(0, 20), section: b.section || null,
      dob: String(b.dob || ''), country: String(b.country || '').trim().slice(0, 80),
      roles: ['member'], status: 'active', provider: 'local',
    });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ msg: 'A member with this email already exists' });
    throw e;
  }
  const adder = await User.findById(req.user.id, { name: 1 }).lean();
  const emailSent = await emailService.sendWelcomeEmail(user, adder?.name);
  await security.recordAction(req, 'member_added', user, `Added as a member${emailSent ? '' : ' (welcome email failed)'}`);
  res.json({ ok: true, emailSent, member: mapMember(user) });
};

// POST /api/members/:id/section — President, Provost or PRO sets the part a member sings
exports.section = async (req, res) => {
  if (!has(req, ADDERS)) return res.status(403).json({ msg: "Only the President, Provost or PRO can change a member's part" });
  const { section } = req.body || {};
  if (!PARTS.includes(section)) return res.status(400).json({ msg: 'Choose Soprano, Alto, Tenor or Bass' });
  const user = await load(req, res);
  if (!user) return;
  const before = user.section;
  user.section = section;
  await user.save();
  await security.recordAction(req, 'part_changed', user, `Part changed from ${before || 'not set'} to ${section}`);
  res.json({ ok: true });
};

// POST /api/members/:id/roles { add: role } or { remove: role } — the President and admins grant and remove
// executive roles one change at a time. "Old Member" replaces every executive role. The admin role itself is
// changed only through the confirmed step on the Security side (security.controller.js adminRole).
const ROLE_LABEL = require('./data.controller').ROLE_LABEL;
const GRANTABLE = ['president', 'secretary', 'finance', 'provost', 'pro', 'choirmaster', 'asstchoirmaster', 'custodian', 'electoral', 'alumni'];
const roleHistory = require('../services/roleHistory');
exports.roles = async (req, res) => {
  if (!has(req, MANAGERS) || (req.user.roles || []).includes('alumni')) return res.status(403).json({ msg: 'Only the President or an admin can change roles' });
  const add = req.body?.add; const remove = req.body?.remove;
  const role = add || remove;
  if (!GRANTABLE.includes(role) || (add && remove)) return res.status(400).json({ msg: 'Choose a role' });
  const user = await load(req, res);
  if (!user) return;
  if (user.status !== 'active') return res.status(400).json({ msg: 'Only an active member can be given a role' });
  const before = user.roles || ['member'];
  let next;
  if (add) {
    if (before.includes(role)) return res.status(400).json({ msg: `${user.name} already has this role` });
    if (role === 'alumni' && before.includes('admin')) return res.status(400).json({ msg: 'Hand over or give up the admin role before making this member an Old Member' });
    if (before.includes('alumni') && role !== 'alumni') return res.status(400).json({ msg: 'An Old Member cannot hold an executive role' });
    next = role === 'alumni' ? ['alumni'] : [...before.filter((r) => r !== 'member'), role];
  } else {
    if (!before.includes(role)) return res.status(400).json({ msg: `${user.name} does not have this role` });
    next = before.filter((r) => r !== role);
    if (!next.length) next = ['member'];
  }
  // Only applied if nobody else changed this member's roles in the meantime
  const raw = await User.findById(user._id, { roles: 1 }).lean();
  const same = Array.isArray(raw?.roles) && raw.roles.length ? { roles: raw.roles } : { $or: [{ roles: { $exists: false } }, { roles: { $size: 0 } }] };
  const updated = await User.findOneAndUpdate({ _id: user._id, ...same }, { $set: { roles: next } }, { new: true });
  if (!updated) return res.status(409).json({ msg: 'Someone else just changed this member\'s roles: refresh the page' });
  const gained = next.filter((r) => r !== 'member' && !before.includes(r));
  const lost = before.filter((r) => r !== 'member' && !next.includes(r));
  for (const r of gained) { await roleHistory.granted(user._id, r); await security.recordAction(req, 'role_granted', updated, `Granted ${ROLE_LABEL[r] || r}`); }
  for (const r of lost) { await roleHistory.revoked(user._id, r); await security.recordAction(req, 'role_revoked', updated, `Removed ${ROLE_LABEL[r] || r}`); }
  res.json({ ok: true, member: mapMember(updated.toObject()), roleHistory: await roleHistory.list() });
};
