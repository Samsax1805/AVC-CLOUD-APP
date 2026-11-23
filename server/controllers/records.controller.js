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

// Stage 2: records that are simple lists of fields. Each kind lists the fields it may hold, which are
// required, and the roles that manage it. "by" and "roleAtTime" are filled in by the server.
const S = (n) => ({ t: 'str', n });
const FILE = { t: 'str', n: 80 }; // an uploaded file's id
const SIMPLE = {
  songs: { model: R.Song, writers: ['admin', 'president', 'custodian'], label: 'song', need: ['title'], fields: { title: S(200), part: S(60), format: S(20), size: S(20), duration: S(20), date: { t: 'date' }, tag: S(40), categories: { t: 'list', n: 40, max: 20 }, cover: S(40), fileUrl: FILE, fileName: S(200), mime: S(100), preview: S(1500000) } },
  voiceNotes: { model: R.VoiceNote, writers: ['admin', 'president', 'custodian'], label: 'voice note', need: ['title', 'fileUrl'], fields: { title: S(200), duration: S(20), date: { t: 'date' }, seed: { t: 'num' }, fileUrl: FILE, fileName: S(200), mime: S(100), source: S(20) } },
  minutes: { model: R.Minute, writers: ['admin', 'president', 'secretary'], label: 'set of minutes', role: true, need: ['title', 'body'], fields: { title: S(200), body: S(100000), date: { t: 'date' } } },
  receipts: { model: R.Receipt, writers: ['admin', 'president', 'secretary'], label: 'receipt', need: ['title', 'amount'], fields: { title: S(200), amount: { t: 'money' }, category: S(60), date: { t: 'date' }, fileUrl: FILE, fileName: S(200), mime: S(100) } },
  announcements: { model: R.Announcement, writers: ['admin', 'president', 'secretary'], label: 'announcement', role: true, need: ['title', 'body'], fields: { title: S(200), body: S(20000), date: { t: 'date' }, pinned: { t: 'bool' } } },
  documents: { model: R.ChoirDocument, writers: ['admin', 'president', 'secretary'], label: 'document', role: true, need: ['title', 'fileUrl'], fields: { title: S(200), category: S(60), version: S(20), date: { t: 'date' }, desc: S(2000), fileUrl: FILE, fileName: S(200), mime: S(100), size: S(20) } },
  probations: { model: R.Probation, writers: ['admin', 'president', 'provost'], label: 'probation', role: true, need: ['memberId', 'reason'], member: true, fields: { memberId: S(40), reason: S(1000), notes: S(2000), start: { t: 'date' }, end: { t: 'date' }, status: { t: 'pick', of: ['active', 'released'] } } },
  duesSettings: { model: R.DuesSetting, writers: ['admin', 'president'], label: 'dues setting', role: true, need: ['amount', 'effectiveFrom'], fields: { amount: { t: 'money' }, effectiveFrom: { t: 'date' } } },
};
for (const [k, v] of Object.entries(SIMPLE)) KINDS[k] = { ...v, key: k };
const { ROLE_LABEL } = require('./data.controller');
const roleText = (roles = []) => (roles.filter((r) => r !== 'member').map((r) => ROLE_LABEL[r] || r).join(' + ') || 'Member');
const cleanSimple = async (spec, b, before) => {
  const set = {};
  for (const [f, rule] of Object.entries(spec.fields)) {
    if (b[f] === undefined) continue;
    const v = b[f];
    if (rule.t === 'str') { if (v !== null && typeof v !== 'string') return { error: `Invalid ${f}` }; set[f] = text(v || '', rule.n); }
    if (rule.t === 'date') { if (v && !DATE.test(v)) return { error: `Invalid date (${f})` }; set[f] = v || ''; }
    if (rule.t === 'num') { const n = Number(v); if (!Number.isFinite(n)) return { error: `Invalid ${f}` }; set[f] = n; }
    if (rule.t === 'money') { const n = money(v); if (!(n >= 0) || n > 10000000) return { error: 'Enter a valid amount' }; set[f] = n; }
    if (rule.t === 'bool') set[f] = !!v;
    if (rule.t === 'pick') { if (!rule.of.includes(v)) return { error: `Invalid ${f}` }; set[f] = v; }
    if (rule.t === 'list') { if (!Array.isArray(v)) return { error: `Invalid ${f}` }; set[f] = v.filter((x) => typeof x === 'string').map((x) => text(x, rule.n)).filter(Boolean).slice(0, rule.max); }
  }
  if (spec.member && set.memberId !== undefined && !(await memberExists(set.memberId))) return { error: 'Choose a member' };
  if (!before) for (const f of spec.need) if (set[f] === undefined || set[f] === '' || (spec.fields[f].t === 'money' && !(set[f] > 0))) return { error: `Missing ${f}` };
  return { set, unset: {} };
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
  if (SIMPLE[req.params.kind]) return createSimple(req, res, k, b);
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

const createSimple = async (req, res, k, b) => {
  const c = await cleanSimple(k, b, null);
  if (c.error) return res.status(400).json({ msg: c.error });
  const doc = { uid: newId(req.params.kind.slice(0, 3)), ...c.set, by: req.user.id };
  if (k.fields.date && !doc.date) doc.date = today();
  if (k.role) doc.roleAtTime = roleText(req.user.roles || []);
  if (req.params.kind === 'probations') { doc.status = 'active'; doc.start = doc.start || today(); doc.history = [{ ev: 'Started', date: today(), by: req.user.id }]; }
  if (req.params.kind === 'announcements' && doc.pinned === undefined) doc.pinned = false;
  const made = await k.model.create(doc);
  res.json({ ok: true, record: shape(made.toObject()) });
};

// PUT /api/records/:kind/:id — changes only the fields sent
exports.update = async (req, res) => {
  const k = kindOf(req, res); if (!k) return;
  const id = String(req.params.id);
  const before = await k.model.findOne({ uid: id }).lean();
  if (!before) return res.status(404).json({ msg: `That ${k.label} was not found. Someone may have removed it: refresh the page.` });
  const c = SIMPLE[req.params.kind] ? await cleanSimple(k, req.body || {}, before) : await clean(req.params.kind, req.body || {}, before);
  if (c.error) return res.status(400).json({ msg: c.error });
  // Probation: each change is added to its history by the server ({ event: 'Released' | 'Extended' | … })
  if (req.params.kind === 'probations' && req.body?.event) c.push = { history: { ev: text(req.body.event, 40), date: today(), by: req.user.id } };
  const update = {};
  if (c.push) update.$push = c.push;
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
