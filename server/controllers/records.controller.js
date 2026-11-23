const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const R = require('../models/records');
const tombstones = require('../services/tombstones');
const { lagosNow } = require('../services/birthday.service');

// One record at a time for attendance, dues and debts. Each save changes only the record (and the fields)
// it names, so two officers working at once can no longer overwrite each other with an out-of-date copy.
// The roles are the same as the website's buttons (and the whole-choir save's WRITERS list).
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['present', 'absent', 'late', 'excused'];
const DUE_TYPES = ['weekly', 'absence', 'lateness'];
const today = () => lagosNow(new Date()).date;
const text = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const money = (v) => { const n = Math.round(Number(v) * 100) / 100; return Number.isFinite(n) ? n : NaN; };
const may = (roles = [], list) => !roles.includes('alumni') && roles.some((r) => list.includes(r));
const shape = (d) => { if (!d) return null; const { _id, __v, createdAt, updatedAt, ...rest } = d; return { ...rest, id: rest.uid, ...(rest.records instanceof Map ? { records: Object.fromEntries(rest.records) } : {}) }; };
const newId = (p) => `${p}-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
const memberExists = async (id) => mongoose.isValidObjectId(id) && !!(await User.exists({ _id: id, status: { $ne: 'pending' } }));

const KINDS = {
  dues: { model: R.Due, key: 'dues', writers: ['admin', 'president', 'provost'], label: 'dues record' },
  debts: { model: R.Debt, key: 'debts', writers: ['admin', 'president', 'provost'], label: 'debt' },
  sessions: { model: R.Session, key: 'sessions', writers: ['admin', 'president', 'provost'], label: 'attendance session' },
};
const kindOf = (req, res) => {
  const k = KINDS[req.params.kind];
  if (!k) { res.status(404).json({ msg: 'Not found' }); return null; }
  if (!may(req.user.roles || [], k.writers)) { res.status(403).json({ msg: `You are not allowed to change ${k.label}s` }); return null; }
  return k;
};

// Checks and cleans what may be saved for each kind; returns { set, unset } or { error }
const clean = async (kind, b, before) => {
  const set = {}; const unset = {};
  if (kind === 'dues') {
    if (b.type !== undefined) { if (!DUE_TYPES.includes(b.type)) return { error: 'Choose weekly, absence or lateness' }; set.type = b.type; }
    if (b.memberId !== undefined) { if (!(await memberExists(b.memberId))) return { error: 'Choose a member' }; set.memberId = String(b.memberId); }
    if (b.period !== undefined) { set.period = text(b.period, 40); if (!set.period) return { error: 'Enter the period' }; }
    if (b.amount !== undefined) { set.amount = money(b.amount); if (!(set.amount > 0) || set.amount > 10000000) return { error: 'Enter an amount' }; }
    if (b.date !== undefined) { if (!DATE.test(b.date)) return { error: 'Choose a date' }; set.date = b.date; }
    if (!before) for (const f of ['type', 'memberId', 'period', 'amount']) if (set[f] === undefined) return { error: `Missing ${f}` };
  }
  if (kind === 'debts') {
    if (b.memberId !== undefined) { if (!(await memberExists(b.memberId))) return { error: 'Choose a member' }; set.memberId = String(b.memberId); }
    if (b.desc !== undefined) { set.desc = text(b.desc, 200); if (!set.desc) return { error: 'Enter a description' }; }
    if (b.amount !== undefined) {
      set.amount = money(b.amount);
      if (!(set.amount > 0) || set.amount > 10000000) return { error: 'Enter an amount' };
      if (before && set.amount < (before.paid || 0)) return { error: 'The amount can\'t be less than what has already been paid' };
    }
    if (b.date !== undefined) { if (!DATE.test(b.date)) return { error: 'Choose a date' }; set.date = b.date; }
    if (!before) { for (const f of ['memberId', 'desc', 'amount']) if (set[f] === undefined) return { error: `Missing ${f}` }; set.paid = 0; }
  }
  if (kind === 'sessions') {
    if (b.title !== undefined) set.title = text(b.title, 120) || 'Sunday Worship Service';
    if (b.date !== undefined && !before) { if (!DATE.test(b.date)) return { error: 'Choose the session date' }; set.date = b.date; }
    // Only the marks sent are changed; "" clears a mark. Members' own QR check-ins are never wiped.
    if (b.records && typeof b.records === 'object' && !Array.isArray(b.records)) {
      for (const [id, st] of Object.entries(b.records).slice(0, 500)) {
        if (!mongoose.isValidObjectId(id)) continue;
        if (st === '' || st === null) unset[`records.${id}`] = '';
        else if (STATUSES.includes(st)) set[`records.${id}`] = st;
      }
    }
    if (!before && !set.date) return { error: 'Choose the session date' };
  }
  return { set, unset };
};

// POST /api/records/:kind — a new record (a session for a date that already exists is updated instead)
exports.create = async (req, res) => {
  const k = kindOf(req, res); if (!k) return;
  const b = req.body || {};
  if (req.params.kind === 'sessions' && DATE.test(b.date || '')) {
    const existing = await k.model.findOne({ date: b.date }).lean();
    if (existing) { req.params.id = existing.uid; return exports.update(req, res); }
  }
  const c = await clean(req.params.kind, b, null);
  if (c.error) return res.status(400).json({ msg: c.error });
  const uid = newId({ dues: 'du', debts: 'd', sessions: 'att' }[req.params.kind]);
  const doc = { uid, ...(req.params.kind === 'dues' ? { by: req.user.id, date: c.set.date || today() } : {}), ...(req.params.kind === 'debts' ? { date: c.set.date || today() } : {}) };
  const records = {};
  for (const [f, v] of Object.entries(c.set)) { if (f.startsWith('records.')) records[f.slice(8)] = v; else doc[f] = v; }
  if (req.params.kind === 'sessions') { doc.records = records; doc.checkins = []; doc.title = doc.title || 'Sunday Worship Service'; }
  const made = await k.model.create(doc);
  res.json({ ok: true, record: shape(made.toObject()) });
};

// PUT /api/records/:kind/:id — changes only the fields sent
exports.update = async (req, res) => {
  const k = kindOf(req, res); if (!k) return;
  const id = String(req.params.id);
  const before = await k.model.findOne({ uid: id }).lean();
  if (!before) return res.status(404).json({ msg: `That ${k.label} was not found. Someone may have removed it: refresh the page.` });
  const c = await clean(req.params.kind, req.body || {}, before);
  if (c.error) return res.status(400).json({ msg: c.error });
  const update = {};
  if (Object.keys(c.set).length) update.$set = c.set;
  if (Object.keys(c.unset).length) update.$unset = c.unset;
  // A debt's amount may never drop below what was paid, even if a payment lands at the same moment
  // (older debts may have no "paid" yet: that counts as 0)
  const filter = { uid: id, ...(req.params.kind === 'debts' && c.set.amount !== undefined ? { $expr: { $lte: [{ $ifNull: ['$paid', 0] }, c.set.amount] } } : {}) };
  const after = Object.keys(update).length ? await k.model.findOneAndUpdate(filter, update, { new: true }).lean() : before;
  if (!after) return res.status(409).json({ msg: 'Someone recorded a payment at the same moment: refresh the page and try again' });
  res.json({ ok: true, record: shape(after) });
};

// DELETE /api/records/:kind/:id — removed for good (an old open page can't put it back)
exports.remove = async (req, res) => {
  const k = kindOf(req, res); if (!k) return;
  const id = String(req.params.id);
  const r = await k.model.deleteOne({ uid: id });
  if (!r.deletedCount) return res.status(404).json({ msg: `That ${k.label} was already removed` });
  await tombstones.add(k.key, [id]);
  res.json({ ok: true });
};

// POST /api/records/debts/:id/pay { amount } — one payment, added safely even if two arrive at once
exports.pay = async (req, res) => {
  req.params.kind = 'debts';
  const k = kindOf(req, res); if (!k) return;
  const amt = money(req.body?.amount);
  if (!(amt > 0)) return res.status(400).json({ msg: 'Enter the amount received' });
  const id = String(req.params.id);
  const after = await R.Debt.findOneAndUpdate(
    { uid: id, $expr: { $lte: [{ $add: [{ $ifNull: ['$paid', 0] }, amt] }, '$amount'] } },
    { $inc: { paid: amt } },
    { new: true },
  ).lean();
  if (!after) {
    const d = await R.Debt.findOne({ uid: id }).lean();
    if (!d) return res.status(404).json({ msg: 'That debt was not found. Refresh the page.' });
    return res.status(400).json({ msg: `That is more than the ${Math.round(((d.amount || 0) - (d.paid || 0)) * 100) / 100} still owed`, record: shape(d) });
  }
  res.json({ ok: true, record: shape(after) });
};
