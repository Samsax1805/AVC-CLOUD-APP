const mongoose = require('mongoose');
const User = require('../models/User');

const APPROVERS = ['admin', 'president', 'provost'];
const MANAGERS = ['admin', 'president'];
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
  res.json({ ok: true });
};

// POST /api/members/:id/reject — removes a pending registration
exports.reject = async (req, res) => {
  if (!has(req, APPROVERS)) return res.status(403).json({ msg: 'Only the President or Provost can reject members' });
  const user = await load(req, res, 'pending');
  if (!user) return;
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
  res.json({ ok: true });
};

// POST /api/members/:id/reactivate — grants access back
exports.reactivate = async (req, res) => {
  if (!has(req, MANAGERS)) return res.status(403).json({ msg: 'Only the President or an admin can reactivate members' });
  const user = await load(req, res, 'deactivated');
  if (!user) return;
  user.status = 'active';
  await user.save();
  res.json({ ok: true });
};
