const crypto = require('crypto');
const { Notification, AuditLog } = require('../models/records');
const push = require('../services/push.service');
const { lagosNow } = require('../services/birthday.service');
const { ROLE_LABEL } = require('./data.controller');

// Notices, read marks and the audit log, each saved on its own (the whole-choir save is retired)
const OFFICERS = ['admin', 'president', 'secretary', 'finance', 'provost', 'pro', 'choirmaster', 'asstchoirmaster', 'custodian', 'electoral'];
const may = (roles = [], list) => !roles.includes('alumni') && roles.some((r) => list.includes(r));
const text = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const shape = (d) => { const { _id, __v, createdAt, updatedAt, ...rest } = d; return { ...rest, id: rest.uid }; };
const now = () => { const d = new Date(); const { date } = lagosNow(d); const t = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d); return { date, time: `${date} ${t}` }; };

// POST /api/notices { text } — an officer posts a notice to every member (and their phones)
exports.post = async (req, res) => {
  if (!may(req.user.roles, OFFICERS)) return res.status(403).json({ msg: 'Only officers can post notices' });
  const body = text(req.body?.text, 300);
  if (!body) return res.status(400).json({ msg: 'Write the notice' });
  const uid = `n-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
  const made = await Notification.create({ uid, text: body, date: now().date, readBy: [] });
  push.toAll(body, uid);
  res.json({ ok: true, notice: shape(made.toObject()) });
};

// POST /api/notices/read — every notice so far counts as read for this member
exports.readAll = async (req, res) => {
  const r = await Notification.updateMany({ readBy: { $ne: req.user.id } }, { $addToSet: { readBy: req.user.id } });
  res.json({ ok: true, marked: r.modifiedCount });
};

// POST /api/audit { action, detail } — an entry in the choir's Audit Log, always under the real author
exports.audit = async (req, res) => {
  const action = text(req.body?.action, 40).toUpperCase().replace(/[^A-Z_]/g, '');
  const detail = text(req.body?.detail, 600);
  if (!action || !detail) return res.status(400).json({ msg: 'Invalid request' });
  const roles = (req.user.roles || []).filter((r) => r !== 'member');
  const made = await AuditLog.create({
    uid: `a-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`,
    userId: req.user.id, role: roles.map((r) => ROLE_LABEL[r] || r).join(' + ') || 'Member', action, detail, time: now().time,
  });
  res.json({ ok: true, entry: shape(made.toObject()) });
};
