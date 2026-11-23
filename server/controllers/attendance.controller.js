const crypto = require('crypto');
const User = require('../models/User');
const { Session } = require('../models/records');
const security = require('../services/security.service');
const { isSystem } = require('../config/system');

// QR check-in, signed by the server so a member can only check in with a code the Provost (or
// President / admin) has just shown: the code names the session date and an expiry time, and carries
// a signature only the server can make. Codes last 90 seconds; the officer refreshes them as needed.
const MARKERS = ['admin', 'president', 'provost'];
const LIFE_MS = 90 * 1000;
const GRACE_MS = 15 * 1000; // a code scanned just as it expires still counts
const ZONE = 'Africa/Lagos'; // same clock as the rest of the site (birthday.service.js)
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const may = (roles, list) => !roles.includes('alumni') && roles.some((r) => list.includes(r));
const secret = () => crypto.createHash('sha256').update(`attendance-qr:${process.env.JWT_SECRET}`).digest();
const signature = (date, exp) => crypto.createHmac('sha256', secret()).update(`${date}|${exp}`).digest('base64url').slice(0, 22);
const makeCode = (date, exp) => `${date}.${exp.toString(36)}.${signature(date, exp)}`;
const readCode = (code) => {
  const m = /^(\d{4}-\d{2}-\d{2})\.([0-9a-z]{6,12})\.([A-Za-z0-9_-]{22})$/.exec(String(code || '').trim());
  if (!m) return null;
  const [, date, exp36, sig] = m;
  const exp = parseInt(exp36, 36);
  const good = signature(date, exp);
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  return { date, exp };
};
const timeNow = () => new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
const shape = (s) => { if (!s) return null; const { _id, __v, createdAt, updatedAt, ...rest } = s; return { ...rest, id: rest.uid, records: rest.records instanceof Map ? Object.fromEntries(rest.records) : (rest.records || {}) }; };

// POST /api/attendance/qr { date, title } — a fresh signed code for that session (officers who mark attendance)
exports.qr = async (req, res) => {
  if (!may(req.user.roles || [], MARKERS)) return res.status(403).json({ msg: 'Only the Provost, President or an admin can show the check-in code' });
  const date = String(req.body?.date || '');
  if (!DATE.test(date)) return res.status(400).json({ msg: 'Choose the session date' });
  const title = String(req.body?.title || '').trim().slice(0, 120) || 'Sunday Worship Service';
  // The session exists from the moment its code is shown, so check-ins have somewhere to land
  await Session.updateOne({ date }, { $setOnInsert: { uid: `att-${crypto.randomUUID().slice(0, 12)}`, date, title, records: {}, checkins: [] } }, { upsert: true });
  const exp = Date.now() + LIFE_MS;
  res.json({ code: makeCode(date, exp), exp, date, session: shape(await Session.findOne({ date }).lean()) });
};

// POST /api/attendance/checkin { code } — the member checks themselves in as present
exports.checkin = async (req, res) => {
  const me = await User.findById(req.user.id, { name: 1, email: 1, roles: 1, status: 1 }).lean();
  if (!me || me.status !== 'active' || (me.roles || []).includes('alumni') || isSystem(me)) return res.status(403).json({ msg: 'Only active choir members check in' });
  const parsed = readCode(req.body?.code);
  if (!parsed) {
    security.record(req, { kind: 'action', type: 'checkin_refused', userId: req.user.id, name: me.name, email: me.email, actorId: req.user.id, actorName: me.name, detail: 'Check-in refused: the code was not made by the site' }).catch(() => {});
    return res.status(400).json({ msg: 'That is not a valid check-in code. Scan the code the Provost is showing.' });
  }
  if (Date.now() > parsed.exp + GRACE_MS) return res.status(400).json({ msg: 'This code has expired. Ask the Provost to show a fresh one.' });
  const key = `records.${req.user.id}`;
  const updated = await Session.findOneAndUpdate(
    { date: parsed.date, [key]: { $exists: false } },
    { $set: { [key]: 'present' }, $push: { checkins: { userId: req.user.id, time: timeNow(), method: 'qr' } } },
    { new: true },
  ).lean();
  if (!updated) {
    const s = await Session.findOne({ date: parsed.date }).lean();
    if (!s) return res.status(404).json({ msg: 'That session no longer exists' });
    return res.status(409).json({ msg: 'You are already marked for this session', session: shape(s) });
  }
  res.json({ ok: true, session: shape(updated) });
};

exports._test = { makeCode, readCode };
