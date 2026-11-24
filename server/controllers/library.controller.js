const crypto = require('crypto');
const User = require('../models/User');
const { AuditLog } = require('../models/records');
const { LibraryItem, LibraryTerm, LibraryApprover, nextNumber, peekNumber } = require('../models/Library');
const { Notification } = require('../models/records');
const push = require('../services/push.service');
const { isSystem } = require('../config/system');
const { LISTS, OPEN, SCORE_KINDS } = require('../config/libraryLists');
const storage = require('../services/storage');
const { lagosNow } = require('../services/birthday.service');

// Choir Music & Instrument Library, stage A: the upload queue (design revision 4, pages 2–3, 8–9, 12–13).
// Copies are uploaded first and saved at once with a queue number (Q-0042). Officers fill in the details
// one field at a time; every field saves on its own and two people changing the same field are told,
// never silently overwritten. Approval, CHR / INS numbers and publishing come in stage B.

// Who works on the queue: these roles, plus the Music Approvers (decision 1)
const STAFF = ['admin', 'president', 'custodian', 'choirmaster', 'asstchoirmaster'];
const may = (roles = []) => !roles.includes('alumni') && roles.some((r) => STAFF.includes(r));
// Who approves: the Choir Master, Assistant Choir Master, anyone they bring on board, and the President and admin as back-up.
// All hands on deck (decision b): approvers may approve music they sent themselves; the seal records it.
const ROLE_APPROVERS = ['choirmaster', 'asstchoirmaster', 'president', 'admin'];
const MANAGE_APPROVERS = ['choirmaster', 'asstchoirmaster', 'admin'];
let approverCache = { at: 0, ids: new Set() };
const approverIds = async () => {
  if (Date.now() - approverCache.at < 10000) return approverCache.ids;
  approverCache = { at: Date.now(), ids: new Set((await LibraryApprover.find({}, { userId: 1 }).lean()).map((a) => a.userId)) };
  return approverCache.ids;
};
const isApprover = async (req) => !(req.user.roles || []).includes('alumni')
  && ((req.user.roles || []).some((r) => ROLE_APPROVERS.includes(r)) || (await approverIds()).has(req.user.id));
const staff = async (req) => may(req.user.roles) || isApprover(req);
const AUTO = ['needs', 'ready']; // statuses worked out from the details
const EDITABLE = ['needs', 'ready', 'sent', 'urgent'];
const QUEUE = [...EDITABLE, 'awaiting'];
const CLAIM_MS = 30 * 60 * 1000;
const PAGE = 24;

const text = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const long = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim().slice(0, n) : '');
const refOf = (qno) => `Q-${String(qno).padStart(4, '0')}`;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The details and what each may hold. one / many = from a list, or a custom entry where the list allows it.
const FIELDS = {
  title: { t: 'text', n: 200 },
  firstLine: { t: 'text', n: 300 },
  composer: { t: 'text', n: 120 },
  arranger: { t: 'text', n: 120 },
  type: { t: 'pick', of: ['song', 'instrumental'] },
  genre: { t: 'one', list: 'genre' },
  languages: { t: 'many', list: 'languages', max: 8 },
  originalKey: { t: 'one', list: 'keys' },
  choirKey: { t: 'one', list: 'keys' },
  tempo: { t: 'one', list: 'tempo' },
  bpm: { t: 'num', min: 20, max: 320 },
  tempoChanges: { t: 'text', n: 200 },
  character: { t: 'many', list: 'character', max: 6 },
  massParts: { t: 'many', list: 'massParts', max: 12 },
  occasions: { t: 'many', list: 'occasions', max: 12 },
  seasons: { t: 'many', list: 'seasons', max: 12 },
  themes: { t: 'many', list: 'themes', max: 12 },
  voicing: { t: 'one', list: 'voicing' },
  instruments: { t: 'many', list: 'instruments', max: 15 },
  difficulty: { t: 'pick', of: LISTS.difficulty },
  copyright: { t: 'one', list: 'copyright' },
  source: { t: 'text', n: 300 },
  notes: { t: 'long', n: 2000 },
};

// The 10 things needed before sending for approval (decision 5)
const has = (v) => (Array.isArray(v) ? v.length > 0 : !!v);
const REQUIRED = [
  ['title', (d) => has(d.title)],
  ['type', (d) => has(d.type)],
  ['genre', (d) => has(d.genre)],
  ['composer', (d) => has(d.composer)],
  ['languages', (d) => has(d.languages)],
  ['choirKey', (d) => has(d.choirKey)],
  ['massPartsOrOccasions', (d) => has(d.massParts) || has(d.occasions)],
  ['seasons', (d) => has(d.seasons)],
  ['voicingOrInstruments', (d) => (d.type === 'instrumental' ? has(d.instruments) : has(d.voicing))],
  ['score', (d, files) => (files || []).some((f) => SCORE_KINDS.includes(f.kind))],
];

// Lists: an entry matching an official one (any capitals) takes the official spelling; others are custom
const official = Object.fromEntries(Object.entries(LISTS).map(([k, v]) => [k, new Map(v.map((x) => [x.toLowerCase(), x]))]));
const cleanTerm = (list, raw) => {
  const v = text(raw, 60);
  if (!v) return { v: '' };
  const hit = official[list].get(v.toLowerCase());
  if (hit) return { v: hit };
  if (!OPEN.has(list)) return { bad: true };
  return { v, custom: true };
};

// Turns what the browser sent into what may be stored; { bad } when it can't be
const clean = (field, value) => {
  const f = FIELDS[field];
  if (!f) return { bad: 'Unknown detail' };
  if (f.t === 'text') return { v: text(value, f.n) };
  if (f.t === 'long') return { v: long(value, f.n) };
  if (f.t === 'pick') return value === '' || value === null || f.of.includes(value) ? { v: value || '' } : { bad: 'Choose from the list' };
  if (f.t === 'num') {
    if (value === '' || value === null) return { v: null };
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= f.min && n <= f.max ? { v: n } : { bad: `Enter a number from ${f.min} to ${f.max}` };
  }
  if (f.t === 'one') { const c = cleanTerm(f.list, value); return c.bad ? { bad: 'Choose from the list' } : { v: c.v, customs: c.custom ? [c.v] : [] }; }
  if (!Array.isArray(value)) return { bad: 'Expected a list' };
  const out = []; const customs = [];
  for (const raw of value.slice(0, 40)) {
    const c = cleanTerm(f.list, raw);
    if (c.bad) return { bad: 'Choose from the list' };
    if (c.v && !out.some((x) => x.toLowerCase() === c.v.toLowerCase())) { out.push(c.v); if (c.custom) customs.push(c.v); }
  }
  if (out.length > f.max) return { bad: `Choose up to ${f.max}` };
  return { v: out, customs };
};

// Custom entries become suggestions for everyone
const rememberTerms = (list, values, req, name) => Promise.all(values.map((value) => LibraryTerm.updateOne(
  { list, lower: value.toLowerCase() },
  { $inc: { uses: 1 }, $setOnInsert: { list, value, lower: value.toLowerCase(), by: req.user.id, byName: name } },
  { upsert: true },
).catch(() => {})));

// Names, remembered briefly so saving stays quick
const names = new Map();
const nameOf = async (id) => {
  const hit = names.get(id);
  if (hit && hit.at > Date.now() - 60000) return hit.name;
  const u = await User.findById(id, { name: 1 }).lean().catch(() => null);
  names.set(id, { name: u?.name || 'Someone', at: Date.now() });
  return u?.name || 'Someone';
};

// Who has an item open right now ("Paul is also here", "typing…"). Kept in memory: it only matters for seconds.
const presence = new Map(); // uid → Map(userId → { name, field, at })
const PRESENT_MS = 35000;
const here = (uid, except) => {
  const m = presence.get(uid); if (!m) return [];
  const out = [];
  for (const [id, p] of m) {
    if (Date.now() - p.at > PRESENT_MS) m.delete(id);
    else if (id !== except) out.push({ name: p.name, field: p.field || '' });
  }
  if (!m.size) presence.delete(uid);
  return out;
};

const derive = (doc) => {
  const d = doc.d || {};
  const missing = REQUIRED.filter(([, ok]) => !ok(d, doc.files)).map(([k]) => k);
  const search = [refOf(doc.qno), doc.code, d.title, d.composer, d.arranger, d.firstLine, d.genre, ...(d.languages || []), ...(doc.files || []).map((f) => f.name)]
    .filter(Boolean).join(' ').toLowerCase().slice(0, 2000);
  return { done: REQUIRED.length - missing.length, missing, search, status: missing.length ? 'needs' : 'ready' };
};

// Keeps progress, status and search in step. Only the latest change's version lands (rev must still match),
// and that version already includes every earlier change, so two quick saves can't leave it out of date.
const settle = async (doc) => {
  const x = derive(doc);
  const set = { done: x.done, missing: x.missing, search: x.search };
  if (AUTO.includes(doc.status)) set.status = x.status;
  if (set.status && set.status !== doc.status) invalidate();
  await LibraryItem.updateOne({ _id: doc._id, rev: doc.rev }, { $set: set });
  return { ...doc, ...set };
};

const fileView = (f) => ({ fid: f.fid, id: f.id || '', link: f.link || '', kind: f.kind, part: f.part, version: f.version, name: f.name, mime: f.mime || '', size: f.size || 0, byName: f.byName, at: f.at });
const claimView = (c, me) => (c?.userId ? { name: c.name, mine: c.userId === me, active: Date.now() - new Date(c.at) < CLAIM_MS } : null);
const view = (doc, me, x = derive(doc)) => ({
  uid: doc.uid, ref: refOf(doc.qno), code: doc.code || null, status: AUTO.includes(doc.status) ? x.status : doc.status, existing: !!doc.existing, d: doc.d || {},
  meta: Object.fromEntries(Object.entries(doc.meta || {}).map(([k, m]) => [k, { r: m.r, byName: m.byName, at: m.at, mine: m.by === me }])),
  done: x.done, total: REQUIRED.length, missing: x.missing,
  files: (doc.files || []).map(fileView),
  claim: claimView(doc.claim, me),
  dup: doc.dupOf && !doc.dupDismissed ? { uid: doc.dupOf, ref: doc.dupRef } : null,
  history: (doc.history || []).slice(-30).reverse(),
  sentBack: doc.status === 'sent' ? doc.sentBack : null,
  sent: doc.sentAt ? { byName: doc.sentByName, at: doc.sentAt } : null,
  urgent: doc.urgent?.at ? { reason: doc.urgent.reason, byName: doc.urgent.byName, at: doc.urgent.at } : null,
  live: !!doc.live,
  seal: doc.seal ? { code: doc.seal.code, byName: doc.seal.byName, at: doc.seal.at, self: doc.seal.self } : null,
  publishAt: doc.publishAt || null, publishedAt: doc.publishedAt || null,
  createdByName: doc.createdByName, createdAt: doc.createdAt, updatedAt: doc.updatedAt,
  here: here(doc.uid, me),
});
const card = (doc, me) => ({
  uid: doc.uid, ref: refOf(doc.qno), code: doc.code || null, title: doc.d?.title || '', status: doc.status, done: doc.done, total: REQUIRED.length, live: !!doc.live,
  files: (doc.files || []).length,
  recording: (doc.files || []).some((f) => f.link || /^(audio|video)\//.test(f.mime || '')),
  existing: !!doc.existing,
  dup: doc.dupOf && !doc.dupDismissed ? doc.dupRef : null,
  claim: claimView(doc.claim, me),
  editing: here(doc.uid, me).map((p) => p.name),
  updatedAt: doc.updatedAt,
});

const audit = async (req, action, detail) => {
  const d = new Date();
  const t = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  const { ROLE_LABEL } = require('./data.controller');
  const roles = (req.user.roles || []).filter((r) => r !== 'member');
  return AuditLog.create({
    uid: `a-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`,
    userId: req.user.id, role: roles.map((r) => ROLE_LABEL[r] || r).join(' + ') || 'Member', action, detail, time: `${lagosNow(d).date} ${t}`,
  }).catch(() => {});
};

// An item leaving the queue: copies flagged as "same file as" it no longer point at it
const clearDupsOf = (uid) => LibraryItem.updateMany({ dupOf: uid }, { $unset: { dupOf: '', dupRef: '' } }).catch(() => {});

const deny = (res) => res.status(403).json({ msg: 'Only the Custodian, Choir Master, Assistant Choir Master, President or an admin can work on the upload queue' });
const gone = (res) => res.status(404).json({ msg: 'This item is no longer in the queue' });

/* ---------- uploads ---------- */
// The library takes scores (PDF, images, MusicXML, MuseScore), audio, MIDI and video
const BY_EXT = {
  pdf: 'application/pdf', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm',
  mid: 'audio/midi', midi: 'audio/midi', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic',
  mp4: 'video/mp4', mov: 'video/quicktime', musicxml: 'application/vnd.recordare.musicxml+xml', xml: 'application/vnd.recordare.musicxml+xml',
  mxl: 'application/vnd.recordare.musicxml', mscz: 'application/x-musescore', mscx: 'application/x-musescore+xml',
};
const OK_TYPE = /^(audio\/|video\/|image\/|application\/pdf$|application\/vnd\.recordare\.musicxml(\+xml)?$|application\/x-musescore(\+xml)?$)/;
const typeFor = (name, type) => {
  const ext = (/\.([a-z0-9]{1,8})$/i.exec(String(name || '')) || [])[1]?.toLowerCase();
  const t = String(type || '').toLowerCase();
  if (OK_TYPE.test(t)) return t;
  return BY_EXT[ext] || '';
};

// POST /api/library/uploads { name, type, size } → where to send the file (whole, or in 8 MB parts)
exports.uploadSlot = async (req, res) => {
  if (!(await staff(req))) return deny(res);
  if (!storage.configured()) return res.status(503).json({ msg: 'File storage is not configured' });
  const name = text(req.body?.name, 200) || 'file';
  const size = Number(req.body?.size) || 0;
  const type = typeFor(name, req.body?.type);
  if (!type) return res.status(415).json({ msg: 'Upload a score (PDF, picture, MusicXML or MuseScore), an audio or MIDI file, or a video' });
  if (!(size > 0)) return res.status(400).json({ msg: 'Empty file' });
  if (size > storage.MAX_BYTES) return res.status(413).json({ msg: `Files can be up to ${storage.MAX_BYTES / 1048576} MB` });
  const id = storage.newId(name);
  if (size <= storage.PART_BYTES) return res.json({ id, type, name, size, url: await storage.putUrl(id, type, size), headers: { 'Content-Type': type } });
  const count = Math.ceil(size / storage.PART_BYTES);
  const uploadId = await storage.startParts(id, type);
  const urls = await Promise.all(Array.from({ length: count }, (_, i) => storage.partUrl(id, uploadId, i + 1)));
  res.json({ id, type, name, size, uploadId, partSize: storage.PART_BYTES, urls });
};

// POST /api/library/uploads/parts { id, uploadId, parts:[n] } → fresh links (they last 15 minutes) when resuming
exports.partLinks = async (req, res) => {
  if (!(await staff(req))) return deny(res);
  const { id, uploadId } = req.body || {};
  const parts = (Array.isArray(req.body?.parts) ? req.body.parts : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 13);
  if (!storage.ID.test(String(id)) || typeof uploadId !== 'string' || uploadId.length > 1100) return res.status(400).json({ msg: 'Invalid request' });
  res.json({ urls: Object.fromEntries(await Promise.all(parts.map(async (n) => [n, await storage.partUrl(id, uploadId, n)]))) });
};

// POST /api/library/uploads/abort { id, uploadId } — an upload given up on
exports.abortUpload = async (req, res) => {
  if (!(await staff(req))) return deny(res);
  const { id, uploadId } = req.body || {};
  if (storage.ID.test(String(id)) && typeof uploadId === 'string' && uploadId.length < 1100) await storage.abortParts(id, uploadId);
  res.json({ ok: true });
};

// The file described by the browser, checked against what actually arrived in storage
const KINDS_BY_TYPE = (mime, name, part) => {
  if (/^audio\/(midi|x-midi)/.test(mime)) return 'MIDI';
  if (/^audio\//.test(mime)) return part !== 'Full' ? 'Practice audio' : 'Full recording';
  if (/^video\//.test(mime)) return 'Performance video';
  if (/musicxml|musescore/.test(mime)) return 'Notation file';
  return part !== 'Full' ? 'Part score' : 'Full score';
};
const PART_WORDS = [['soprano', 'Soprano'], ['alto', 'Alto'], ['tenor', 'Tenor'], ['bass', 'Bass'], ['baritone', 'Baritone'], ['descant', 'Descant'],
  ['organ', 'Organ'], ['piano', 'Piano'], ['keyboard', 'Keyboard'], ['guitar', 'Guitar'], ['violin', 'Violin'], ['flute', 'Flute'], ['trumpet', 'Trumpet']];
const guessPart = (name) => {
  const n = String(name || '').toLowerCase();
  if (/bass[-_ ]?guitar/.test(n)) return 'Bass guitar';
  if (/\bsatb\b|full/.test(n)) return 'Full';
  return (PART_WORDS.find(([w]) => new RegExp(`(^|[^a-z])${w}`).test(n)) || [])[1] || 'Full';
};
const prettyTitle = (name) => String(name || '').replace(/\.[a-z0-9]{1,8}$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/\b(satb|full|score|soprano|alto|tenor|bass|organ|piano|practice)\b/gi, '').replace(/\s+/g, ' ').trim()
  .replace(/^./, (c) => c.toUpperCase()).slice(0, 200);

// Reads { upload | link, kind, part } into a file entry. Finishes an upload in parts and confirms the file is stored.
const takeFile = async (body, req, byName) => {
  const at = new Date();
  const base = { fid: `f-${crypto.randomBytes(5).toString('hex')}`, by: req.user.id, byName, at };
  const kindOk = (k) => LISTS.fileKinds.includes(k);
  if (body.link) {
    const url = text(body.link.url ?? body.link, 500);
    let u; try { u = new URL(url); } catch { return { bad: 'Paste a full web link (https://…)' }; }
    if (u.protocol !== 'https:') return { bad: 'Paste a full web link (https://…)' };
    const part = cleanTerm('parts', body.part || 'Full').v || 'Full';
    return { file: { ...base, link: u.toString(), name: text(body.link.name, 200) || u.hostname, kind: kindOk(body.kind) ? body.kind : 'Recording link', part } };
  }
  const up = body.upload || {};
  if (!storage.ID.test(String(up.id))) return { bad: 'Upload a file or paste a link' };
  if (up.uploadId) {
    const parts = (Array.isArray(up.parts) ? up.parts : []).map((p) => ({ n: Number(p?.n), etag: text(p?.etag, 100) }))
      .filter((p) => Number.isInteger(p.n) && p.n >= 1 && p.n <= 13 && p.etag);
    if (!parts.length) return { bad: 'The upload did not finish' };
    try { await storage.finishParts(up.id, String(up.uploadId), parts); } catch (e) {
      if (!(await storage.head(up.id))) return { bad: 'The upload did not finish — please upload the file again' };
    }
  }
  const stored = await storage.head(up.id);
  if (!stored) return { bad: 'The file did not finish uploading — please try again' };
  if (stored.size > storage.MAX_BYTES) { await storage.remove(up.id); return { bad: 'Files can be up to 100 MB' }; }
  const name = text(up.name, 200) || up.id;
  const mime = typeFor(name, stored.type || up.type);
  const part = body.part ? (cleanTerm('parts', body.part).v || 'Full') : guessPart(name);
  return { file: { ...base, id: up.id, name, mime, size: stored.size, etag: stored.etag, part, kind: kindOk(body.kind) ? body.kind : KINDS_BY_TYPE(mime, name, part) } };
};

// Another item already holding the very same file (same fingerprint and size)?
const findDup = async (file, notUid) => (file.etag ? LibraryItem.findOne(
  { uid: { $ne: notUid }, status: { $nin: ['removed'] }, files: { $elemMatch: { etag: file.etag, size: file.size } } },
  { uid: 1, qno: 1 },
).lean() : null);

/* ---------- the queue ---------- */
// The filter counts change slowly: kept for 5 seconds per person, and dropped at once when the queue changes
const countCache = new Map();
const invalidate = () => countCache.clear();
const countsFor = async (me, base) => {
  const hit = countCache.get(me);
  if (hit && hit.at > Date.now() - 5000) return hit.c;
  const rows = await LibraryItem.aggregate([{ $match: base }, { $group: {
    _id: null, all: { $sum: 1 },
    needs: { $sum: { $cond: [{ $eq: ['$status', 'needs'] }, 1, 0] } },
    ready: { $sum: { $cond: [{ $eq: ['$status', 'ready'] }, 1, 0] } },
    awaiting: { $sum: { $cond: [{ $eq: ['$status', 'awaiting'] }, 1, 0] } },
    sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
    urgent: { $sum: { $cond: [{ $eq: ['$status', 'urgent'] }, 1, 0] } },
    existing: { $sum: { $cond: ['$existing', 1, 0] } },
    duplicates: { $sum: { $cond: [{ $and: [{ $gt: ['$dupOf', null] }, { $ne: ['$dupDismissed', true] }] }, 1, 0] } },
    mine: { $sum: { $cond: [{ $eq: ['$claim.userId', me] }, 1, 0] } },
  } }]);
  const { _id, ...c } = rows[0] || {};
  const out = { all: 0, needs: 0, ready: 0, awaiting: 0, sent: 0, urgent: 0, existing: 0, duplicates: 0, mine: 0, ...c };
  if (countCache.size > 500) countCache.clear();
  countCache.set(me, { at: Date.now(), c: out });
  return out;
};
// GET /api/library/items?filter=&q=&sort=&page= — one page of cards (card fields only, for speed)
exports.list = async (req, res) => {
  if (!(await staff(req))) return deny(res);
  const me = req.user.id;
  const base = { status: { $in: QUEUE } };
  const filter = String(req.query.filter || 'all');
  const q = { ...base };
  if (['needs', 'ready', 'awaiting', 'sent', 'urgent'].includes(filter)) q.status = filter;
  if (filter === 'existing') q.existing = true;
  if (filter === 'duplicates') { q.dupOf = { $exists: true, $ne: null }; q.dupDismissed = { $ne: true }; }
  if (filter === 'mine') q['claim.userId'] = me;
  const words = text(req.query.q, 80).toLowerCase();
  if (words) q.search = { $regex: esc(words) };
  const sort = { progress: { done: -1, qno: 1 }, recent: { updatedAt: -1 }, newest: { qno: -1 } }[req.query.sort] || { qno: 1 };
  const page = Math.max(1, Math.min(1000, Number(req.query.page) || 1));
  const filtered = filter !== 'all' || !!words;
  const [rows, counts, count] = await Promise.all([
    LibraryItem.find(q, { uid: 1, qno: 1, code: 1, live: 1, status: 1, 'd.title': 1, done: 1, 'files.link': 1, 'files.mime': 1, existing: 1, dupOf: 1, dupRef: 1, dupDismissed: 1, claim: 1, updatedAt: 1 })
      .sort(sort).skip((page - 1) * PAGE).limit(PAGE).lean(),
    countsFor(me, base),
    filtered ? LibraryItem.countDocuments(q) : null,
  ]);
  const total = filtered ? count : counts.all;
  res.json({ items: rows.map((r) => card(r, me)), total, page, pages: Math.max(1, Math.ceil(total / PAGE)), counts });
};

// GET /api/library/items/:uid — everything about one item
exports.get = async (req, res) => {
  if (!(await staff(req))) return deny(res);
  const doc = await LibraryItem.findOne({ uid: req.params.uid, status: { $ne: 'removed' } }).lean();
  if (!doc) return gone(res);
  res.json({ item: view(doc, req.user.id) });
};

// POST /api/library/items { key, upload | link, kind?, part?, title? } — a copy joins the queue with its Q number
exports.create = async (req, res) => {
  if (!(await staff(req))) return deny(res);
  const key = text(req.body?.key, 64) || null;
  // Already saved (the browser is retrying after a dropped connection)? Give back the same item.
  const again = async () => {
    const or = [];
    if (key) or.push({ ckey: key });
    if (storage.ID.test(String(req.body?.upload?.id))) or.push({ 'files.id': req.body.upload.id });
    return or.length ? LibraryItem.findOne({ $or: or }).lean() : null;
  };
  const prior = await again();
  if (prior) return res.json({ item: view(prior, req.user.id), again: true });
  const byName = await nameOf(req.user.id);
  const got = await takeFile(req.body || {}, req, byName);
  if (got.bad) return res.status(400).json({ msg: got.bad });
  const file = { ...got.file, version: 1 };
  const title = text(req.body?.title, 200) || prettyTitle(file.name) || 'Untitled';
  const dup = await findDup(file);
  const qno = await nextNumber('libq');
  const now = new Date();
  let doc;
  try {
    doc = (await LibraryItem.create({
      uid: `lib-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`, ...(key ? { ckey: key } : {}), qno,
      d: { title }, meta: { title: { r: 1, by: req.user.id, byName, at: now } }, files: [file],
      ...(dup ? { dupOf: dup.uid, dupRef: refOf(dup.qno) } : {}),
      createdBy: req.user.id, createdByName: byName, rev: 1,
      history: [{ at: now, by: req.user.id, byName, ev: 'Uploaded', detail: file.name }],
    })).toObject();
  } catch (e) {
    if (e.code === 11000) { const p = await again(); if (p) return res.json({ item: view(p, req.user.id), again: true }); }
    throw e;
  }
  doc = await settle(doc); // the upload is in the item's own history (not the Audit Log, which every sign-in loads)
  invalidate();
  res.json({ item: view(doc, req.user.id) });
};

// PATCH /api/library/items/:uid { field, value, base } — saves one detail. base = the field's revision the
// browser last saw. If someone else changed that field since, nothing is saved and the answer says who and what.
exports.save = async (req, res) => {
  if (!(await staff(req))) return deny(res);
  const { field } = req.body || {};
  const base = Number(req.body?.base) || 0;
  const c = clean(field, req.body?.value);
  if (c.bad) return res.status(400).json({ msg: c.bad });
  const byName = await nameOf(req.user.id);
  const now = new Date();
  const cond = { uid: req.params.uid, status: { $in: EDITABLE } };
  if (base) cond[`meta.${field}.r`] = base; else cond[`meta.${field}`] = { $exists: false };
  const doc = await LibraryItem.findOneAndUpdate(cond, {
    $set: { [`d.${field}`]: c.v, [`meta.${field}`]: { r: base + 1, by: req.user.id, byName, at: now } }, $inc: { rev: 1 },
  }, { new: true }).lean();
  if (!doc) {
    const cur = await LibraryItem.findOne({ uid: req.params.uid }, { status: 1, [`d.${field}`]: 1, [`meta.${field}`]: 1 }).lean();
    if (!cur || cur.status === 'removed') return gone(res);
    if (!EDITABLE.includes(cur.status)) return res.status(409).json({ code: 'LOCKED', msg: 'The details are locked while the approvers review this song' });
    const m = cur.meta?.[field] || {};
    return res.status(409).json({ code: 'CONFLICT', field, value: cur.d?.[field] ?? '', r: m.r || 0, byName: m.byName || 'Someone', at: m.at, mine: m.by === req.user.id });
  }
  // Working on my claimed item keeps the claim alive (refreshed at most every 5 minutes: one less database step per save)
  if (doc.claim?.userId === req.user.id && Date.now() - new Date(doc.claim.at) > 5 * 60000) LibraryItem.updateOne({ uid: doc.uid, 'claim.userId': req.user.id }, { $set: { 'claim.at': now } }).catch(() => {});
  const p = presence.get(doc.uid)?.get(req.user.id); if (p) p.at = Date.now();
  if (c.customs?.length) rememberTerms(FIELDS[field].list, c.customs, req, byName);
  // Progress is worked out from the item just saved and the answer goes back at once; recording it runs alongside
  // (one less wait per save). Every later change records it again, so it can never stay out of date.
  const x = derive(doc);
  settle(doc).catch((e) => console.error('Library progress not recorded:', e.message));
  res.json({ ok: true, field, value: c.v, r: base + 1, done: x.done, total: REQUIRED.length, missing: x.missing, status: EDITABLE.includes(doc.status) ? x.status : doc.status });
};

// POST /api/library/items/:uid/files { upload | link, kind?, part? } — another score, part or recording
exports.addFile = async (req, res) => {
  if (!(await staff(req))) return deny(res);
  const uid = req.params.uid;
  const cur = await LibraryItem.findOne({ uid }, { status: 1, files: 1, binned: 1, dupOf: 1 }).lean();
  if (!cur || cur.status === 'removed') return gone(res);
  if (!EDITABLE.includes(cur.status)) return res.status(409).json({ code: 'LOCKED', msg: 'The details are locked while the approvers review this song' });
  const upId = req.body?.upload?.id;
  if (upId && cur.files.some((f) => f.id === upId)) return exports.get(req, res); // a retry: already saved
  if (upId && await LibraryItem.exists({ 'files.id': upId })) return res.status(409).json({ msg: 'This file belongs to another item' });
  const byName = await nameOf(req.user.id);
  const got = await takeFile(req.body || {}, req, byName);
  if (got.bad) return res.status(400).json({ msg: got.bad });
  const f = got.file;
  // The very same file is already on this item: nothing to add (the copy just uploaded is not kept)
  if (f.etag && (cur.files || []).some((x) => x.etag === f.etag && x.size === f.size)) {
    if (f.id) await storage.remove(f.id);
    return res.status(409).json({ msg: 'This exact file is already on this item' });
  }
  const same = [...(cur.files || []), ...(cur.binned || [])].filter((x) => x.kind === f.kind && x.part === f.part);
  f.version = same.length ? Math.max(...same.map((x) => x.version || 1)) + 1 : 1;
  const dup = await findDup(f, uid);
  const set = dup && !cur.dupOf ? { $set: { dupOf: dup.uid, dupRef: refOf(dup.qno) } } : {};
  let doc = await LibraryItem.findOneAndUpdate({ uid, status: { $in: EDITABLE } }, {
    ...set, $push: { files: f, history: { $each: [{ at: new Date(), by: req.user.id, byName, ev: 'File added', detail: `${f.kind} · ${f.part}: ${f.name}` }], $slice: -200 } }, $inc: { rev: 1 },
  }, { new: true }).lean();
  if (!doc) return gone(res);
  doc = await settle(doc);
  res.json({ item: view(doc, req.user.id) });
};

// PATCH /api/library/items/:uid/files/:fid { kind?, part? }
exports.changeFile = async (req, res) => {
  if (!(await staff(req))) return deny(res);
  const set = {};
  if (req.body?.kind !== undefined) { if (!LISTS.fileKinds.includes(req.body.kind)) return res.status(400).json({ msg: 'Choose a kind of file' }); set['files.$[f].kind'] = req.body.kind; }
  if (req.body?.part !== undefined) { const p = cleanTerm('parts', req.body.part); if (p.bad || !p.v) return res.status(400).json({ msg: 'Choose a part' }); set['files.$[f].part'] = p.v; }
  if (!Object.keys(set).length) return res.status(400).json({ msg: 'Nothing to change' });
  let doc = await LibraryItem.findOneAndUpdate({ uid: req.params.uid, status: { $in: EDITABLE }, 'files.fid': req.params.fid }, { $set: set, $inc: { rev: 1 } },
    { new: true, arrayFilters: [{ 'f.fid': req.params.fid }] }).lean();
  if (!doc) return gone(res);
  doc = await settle(doc);
  res.json({ item: view(doc, req.user.id) });
};

// DELETE /api/library/items/:uid/files/:fid — the stored copy is kept 30 days, so a mistake can be undone
exports.removeFile = async (req, res) => {
  if (!(await staff(req))) return deny(res);
  const cur = await LibraryItem.findOne({ uid: req.params.uid, status: { $in: EDITABLE }, 'files.fid': req.params.fid }, { files: 1 }).lean();
  if (!cur) return gone(res);
  const f = cur.files.find((x) => x.fid === req.params.fid);
  const byName = await nameOf(req.user.id);
  let doc = await LibraryItem.findOneAndUpdate({ uid: req.params.uid, 'files.fid': req.params.fid }, {
    $pull: { files: { fid: f.fid } },
    $push: { binned: { ...f, binnedAt: new Date() }, history: { $each: [{ at: new Date(), by: req.user.id, byName, ev: 'File removed', detail: `${f.kind} · ${f.part}: ${f.name}` }], $slice: -200 } },
    $inc: { rev: 1 },
  }, { new: true }).lean();
  if (!doc) return gone(res);
  doc = await settle(doc);
  res.json({ item: view(doc, req.user.id) });
};

// POST /api/library/items/:uid/claim { on } — "I'm working on this", so two people don't fill in the same song.
// A claim lapses after 30 minutes without activity; anyone can still help with an item that is claimed.
exports.claim = async (req, res) => {
  if (!(await staff(req))) return deny(res);
  const me = req.user.id;
  const uid = req.params.uid;
  if (req.body?.on === false) {
    const managers = (req.user.roles || []).some((r) => ['admin', 'president', 'choirmaster'].includes(r));
    await LibraryItem.updateOne({ uid, ...(managers ? {} : { 'claim.userId': me }) }, { $unset: { claim: '' } });
    return exports.get(req, res);
  }
  const byName = await nameOf(me);
  const doc = await LibraryItem.findOneAndUpdate({
    uid, status: { $in: EDITABLE },
    $or: [{ 'claim.userId': { $exists: false } }, { 'claim.userId': null }, { 'claim.userId': me }, { 'claim.at': { $lt: new Date(Date.now() - CLAIM_MS) } }],
  }, { $set: { claim: { userId: me, name: byName, at: new Date() } } }, { new: true }).lean();
  if (!doc) {
    const cur = await LibraryItem.findOne({ uid }, { status: 1, claim: 1 }).lean();
    if (!cur || !EDITABLE.includes(cur.status)) return gone(res);
    return res.status(409).json({ msg: `${cur.claim?.name || 'Someone'} is working on this. You can still help fill it in.` });
  }
  invalidate();
  res.json({ item: view(doc, me) });
};

// POST /api/library/items/:uid/presence { field?, leave? } — who else has it open (checked every 15 seconds)
exports.presence = async (req, res) => {
  if (!(await staff(req))) return deny(res);
  const uid = String(req.params.uid).slice(0, 60);
  if (!presence.has(uid)) presence.set(uid, new Map());
  if (req.body?.leave) presence.get(uid).delete(req.user.id);
  else presence.get(uid).set(req.user.id, { name: await nameOf(req.user.id), field: FIELDS[req.body?.field] ? req.body.field : '', at: Date.now() });
  res.json({ here: here(uid, req.user.id) });
};

// POST /api/library/items/:uid/duplicate { action: keep | merge } — the same file was uploaded twice
exports.duplicate = async (req, res) => {
  if (!(await staff(req))) return deny(res);
  const me = req.user.id;
  const cur = await LibraryItem.findOne({ uid: req.params.uid, status: { $in: EDITABLE } }).lean();
  if (!cur || !cur.dupOf) return gone(res);
  if (req.body?.action === 'keep') {
    const doc = await LibraryItem.findOneAndUpdate({ uid: cur.uid }, { $set: { dupDismissed: true } }, { new: true }).lean();
    return res.json({ item: view(doc, me) });
  }
  if (req.body?.action !== 'merge') return res.status(400).json({ msg: 'Choose keep or merge' });
  const target = await LibraryItem.findOne({ uid: cur.dupOf, status: { $in: EDITABLE } }, { uid: 1, files: 1, binned: 1, qno: 1 }).lean();
  if (!target) return res.status(409).json({ msg: `${cur.dupRef} is no longer in the queue. Choose "Keep" instead.` });
  const byName = await nameOf(me);
  const known = new Set(target.files.map((f) => `${f.etag}|${f.size}`));
  const move = cur.files.filter((f) => !f.etag || !known.has(`${f.etag}|${f.size}`));
  const bin = cur.files.filter((f) => !move.includes(f)).map((f) => ({ ...f, binnedAt: new Date() }));
  const now = new Date();
  // The item being merged away is closed first, so its files can never end up in both places
  const closed = await LibraryItem.findOneAndUpdate({ uid: cur.uid, status: { $in: EDITABLE } }, {
    $set: { status: 'removed', mergedInto: target.uid, files: [], live: false }, $push: { binned: { $each: bin }, history: { at: now, by: me, byName, ev: 'Merged', detail: `into ${refOf(target.qno)}` } }, $inc: { rev: 1 },
  }, { new: true }).lean();
  if (!closed) return gone(res);
  await clearDupsOf(cur.uid);
  const all = [...target.files, ...(target.binned || [])];
  const moved = move.map((f) => { const same = all.filter((x) => x.kind === f.kind && x.part === f.part); return { ...f, version: same.length ? Math.max(...same.map((x) => x.version || 1)) + 1 : 1 }; });
  let doc = await LibraryItem.findOneAndUpdate({ uid: target.uid }, {
    $push: { files: { $each: moved }, history: { $each: [{ at: now, by: me, byName, ev: 'Merged in', detail: `${refOf(cur.qno)} (${moved.length} file${moved.length === 1 ? '' : 's'} added)` }], $slice: -200 } }, $inc: { rev: 1 },
  }, { new: true }).lean();
  doc = await settle(doc);
  invalidate();
  audit(req, 'LIBRARY_MERGE', `${refOf(cur.qno)} merged into ${refOf(target.qno)}`);
  res.json({ item: view(doc, me), mergedInto: doc.uid });
};

// DELETE /api/library/items/:uid — takes an item out of the queue (its number is never reused; files kept 30 days)
exports.remove = async (req, res) => {
  if (!(await staff(req))) return deny(res);
  const cur = await LibraryItem.findOne({ uid: req.params.uid, status: { $in: EDITABLE } }, { uid: 1, files: 1, qno: 1, d: 1 }).lean();
  if (!cur) return gone(res);
  const byName = await nameOf(req.user.id);
  await LibraryItem.updateOne({ uid: cur.uid, status: { $in: EDITABLE } }, {
    $set: { status: 'removed', files: [], live: false }, $push: { binned: { $each: cur.files.map((f) => ({ ...f, binnedAt: new Date() })) }, history: { at: new Date(), by: req.user.id, byName, ev: 'Removed from the queue' } }, $inc: { rev: 1 },
  });
  await clearDupsOf(cur.uid);
  invalidate();
  audit(req, 'LIBRARY_REMOVE', `${refOf(cur.qno)} removed from the queue: ${cur.d?.title || ''}`);
  res.json({ ok: true });
};

// GET /api/library/lists — the official lists, people's own entries, and what is needed for approval
exports.lists = async (req, res) => {
  if (!(await staff(req))) return deny(res);
  const terms = await LibraryTerm.find({}, { list: 1, value: 1, uses: 1 }).sort({ uses: -1 }).limit(2000).lean();
  const custom = {};
  for (const t of terms) (custom[t.list] ||= []).push(t.value);
  res.json({ lists: LISTS, custom, open: [...OPEN], required: REQUIRED.map(([k]) => k), scoreKinds: SCORE_KINDS });
};

// Every six hours: files removed more than 30 days ago are deleted from storage for good
exports.startHousekeeping = () => {
  const run = async () => {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const docs = await LibraryItem.find({ 'binned.binnedAt': { $lt: cutoff } }, { uid: 1, binned: 1 }).lean();
    for (const doc of docs) {
      for (const f of doc.binned.filter((x) => x.binnedAt < cutoff && x.id)) {
        if (!(await LibraryItem.exists({ 'files.id': f.id }))) await storage.remove(f.id);
      }
      await LibraryItem.updateOne({ uid: doc.uid }, { $pull: { binned: { binnedAt: { $lt: cutoff } } } });
    }
  };
  // Every 10 minutes: publish songs whose date has come, put back an approval interrupted half-way, and
  // remind the approvers about urgent music still not reviewed after 7 days (at most once a day)
  const often = async () => {
    await publishDue(true);
    await LibraryItem.updateMany({ status: 'approving', approvingAt: { $lt: new Date(Date.now() - 5 * 60000) }, code: { $exists: false } }, { $set: { status: 'awaiting' }, $unset: { approvingAt: '' } });
    const week = new Date(Date.now() - 7 * 24 * 3600 * 1000); const day = new Date(Date.now() - 24 * 3600 * 1000);
    const late = await LibraryItem.find({ live: true, 'urgent.at': { $lt: week }, $or: [{ 'urgent.remindedAt': { $exists: false } }, { 'urgent.remindedAt': { $lt: day } }] }, { uid: 1, qno: 1, d: 1 }).lean();
    if (late.length) {
      const ids = await approverUserIds();
      for (const d of late) {
        push.toUsers(ids, `${refOf(d.qno)} ${d.d?.title || ''} was published urgently over a week ago and still needs its details and approval`, `lib-late-${d.uid}`);
        await LibraryItem.updateOne({ uid: d.uid }, { $set: { 'urgent.remindedAt': new Date() } });
      }
    }
  };
  setInterval(() => often().catch((e) => console.error('Library schedule:', e.message)), 10 * 60000).unref();
  setTimeout(() => run().catch((e) => console.error('Library housekeeping:', e.message)), 60000);
  setInterval(() => run().catch((e) => console.error('Library housekeeping:', e.message)), 6 * 3600 * 1000).unref();
};

/* ---------- stage B: approval, numbers, the seal, publishing ---------- */
const pad = (n) => String(n).padStart(4, '0');
const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v ?? null));
const fingerprint = (d) => crypto.createHash('sha256').update(stable(d || {})).digest('hex');
const lagosDay = () => lagosNow(new Date()).date;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const busy = () => ({ msg: 'This song is no longer waiting for approval' });

// Everyone who approves, for "something is waiting" notifications
const approverUserIds = async () => {
  const byRole = await User.find({ status: 'active', roles: { $in: ROLE_APPROVERS, $nin: ['alumni'] } }, { _id: 1, email: 1 }).lean();
  return [...new Set([...byRole.filter((u) => !isSystem(u)).map((u) => String(u._id)), ...(await approverIds())])];
};
// A notice for every member (and their phones); the same notice is never sent twice
const announce = async (doc, kind, text) => {
  const uid = `lib-${doc.uid}-${kind}`;
  const date = lagosDay();
  const r = await Notification.updateOne({ uid }, { $setOnInsert: { uid, text, date, readBy: [] } }, { upsert: true }).catch(() => ({}));
  if (r.upsertedCount) push.toAll(text, uid);
};
const announcePublished = (doc) => announce(doc, 'published', `🎵 New music in the library: ${doc.d?.title || 'a new song'} (${doc.code})`);

// GET /api/library/me — what this person may do in the library
exports.me = async (req, res) => {
  const approve = await isApprover(req);
  res.json({ staff: may(req.user.roles) || approve, approve, manageApprovers: !(req.user.roles || []).includes('alumni') && (req.user.roles || []).some((r) => MANAGE_APPROVERS.includes(r)) });
};

// GET /api/library/approvers — who approves (by role, and those brought on board)
exports.approvers = async (req, res) => {
  if (!(await staff(req))) return deny(res);
  const { ROLE_LABEL } = require('./data.controller');
  const byRole = await User.find({ status: 'active', roles: { $in: ROLE_APPROVERS, $nin: ['alumni'] } }, { name: 1, roles: 1, email: 1 }).lean();
  const added = await LibraryApprover.find().sort({ createdAt: 1 }).lean();
  const users = new Map((await User.find({ _id: { $in: added.map((a) => a.userId) } }, { name: 1 }).lean()).map((u) => [String(u._id), u.name]));
  res.json({
    byRole: byRole.filter((u) => !isSystem(u)).map((u) => ({ id: String(u._id), name: u.name, role: u.roles.filter((r) => ROLE_APPROVERS.includes(r)).map((r) => ROLE_LABEL[r] || r).join(', ') })),
    added: added.map((a) => ({ id: a.userId, name: users.get(a.userId) || 'Former member', byName: a.byName, at: a.createdAt })),
  });
};
const canManage = (req) => !(req.user.roles || []).includes('alumni') && (req.user.roles || []).some((r) => MANAGE_APPROVERS.includes(r));
// POST /api/library/approvers { userId } — the Choir Master or Assistant Choir Master brings someone on board
exports.addApprover = async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ msg: 'Only the Choir Master, Assistant Choir Master or an admin can choose Music Approvers' });
  const id = String(req.body?.userId || '');
  const u = /^[0-9a-f]{24}$/.test(id) ? await User.findById(id, { name: 1, status: 1, roles: 1, email: 1 }).lean() : null;
  if (!u || u.status !== 'active' || (u.roles || []).includes('alumni') || isSystem(u)) return res.status(400).json({ msg: 'Choose an active member' });
  await LibraryApprover.updateOne({ userId: id }, { $setOnInsert: { userId: id, byId: req.user.id, byName: await nameOf(req.user.id) } }, { upsert: true });
  approverCache.at = 0;
  audit(req, 'LIBRARY_APPROVER', `${u.name} can now approve music`);
  exports.approvers(req, res);
};
// DELETE /api/library/approvers/:userId
exports.removeApprover = async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ msg: 'Only the Choir Master, Assistant Choir Master or an admin can choose Music Approvers' });
  const r = await LibraryApprover.deleteOne({ userId: String(req.params.userId) });
  approverCache.at = 0;
  if (r.deletedCount) audit(req, 'LIBRARY_APPROVER', `${await nameOf(req.params.userId)} no longer approves music`);
  exports.approvers(req, res);
};

// POST /api/library/items/:uid/send — every required detail is complete: off to the approvers (details locked meanwhile)
exports.send = async (req, res) => {
  if (!(await staff(req))) return deny(res);
  for (let tries = 0; tries < 3; tries++) {
    const cur = await LibraryItem.findOne({ uid: req.params.uid }).lean();
    if (!cur || cur.status === 'removed') return gone(res);
    if (!['needs', 'ready', 'sent', 'urgent'].includes(cur.status)) return res.status(409).json({ msg: cur.status === 'awaiting' ? 'It is already waiting for approval' : 'It has already been approved' });
    const x = derive(cur);
    if (x.missing.length) return res.status(400).json({ msg: 'Some required details are still missing', missing: x.missing });
    const byName = await nameOf(req.user.id);
    const doc = await LibraryItem.findOneAndUpdate({ uid: cur.uid, status: cur.status, rev: cur.rev }, {
      $set: { status: 'awaiting', sentBy: req.user.id, sentByName: byName, sentAt: new Date(), done: x.done, missing: [] }, $unset: { sentBack: '' },
      $push: { history: { $each: [{ at: new Date(), by: req.user.id, byName, ev: 'Sent for approval' }], $slice: -200 } }, $inc: { rev: 1 },
    }, { new: true }).lean();
    if (!doc) continue; // a detail changed at that very moment: check again
    invalidate();
    const others = (await approverUserIds()).filter((id) => id !== req.user.id);
    push.toUsers(others, `🎼 ${refOf(doc.qno)} ${doc.d?.title || ''} is waiting for your approval`, `lib-wait-${doc.uid}`);
    return res.json({ item: view(doc, req.user.id) });
  }
  res.status(409).json({ msg: 'It was being changed at that moment — please try again' });
};

// POST /api/library/items/:uid/sendback { reason } — back to the queue with a reason; all its details are kept
exports.sendBack = async (req, res) => {
  if (!(await isApprover(req))) return res.status(403).json({ msg: 'Only Music Approvers can send music back' });
  const reason = text(req.body?.reason, 300);
  if (!reason) return res.status(400).json({ msg: 'Say briefly what needs changing' });
  const byName = await nameOf(req.user.id);
  const doc = await LibraryItem.findOneAndUpdate({ uid: req.params.uid, status: 'awaiting' }, {
    $set: { status: 'sent', sentBack: { reason, byName, at: new Date() } },
    $push: { history: { $each: [{ at: new Date(), by: req.user.id, byName, ev: 'Sent back', detail: reason }], $slice: -200 } }, $inc: { rev: 1 },
  }, { new: true }).lean();
  if (!doc) return res.status(409).json(busy());
  invalidate();
  if (doc.sentBy && doc.sentBy !== req.user.id) push.toUsers([doc.sentBy], `${refOf(doc.qno)} ${doc.d?.title || ''} was sent back: ${reason}`, `lib-back-${doc.uid}`);
  res.json({ item: view(doc, req.user.id) });
};

// GET /api/library/next?type=song|instrumental — the number the next approval would get (a preview only)
exports.nextCode = async (req, res) => {
  if (!(await isApprover(req))) return res.status(403).json({ msg: 'Only Music Approvers' });
  const series = req.query.type === 'instrumental' ? 'INS' : 'CHR';
  res.json({ code: `${series}-${pad(await peekNumber(`lib${series}`))}` });
};

// POST /api/library/items/:uid/approve { publish: now | date | hold, date?, notify? }
// Issues the next permanent number and seals exactly what was approved. If two approvers press Approve at the same
// moment, one succeeds; the other is told who approved it and as what. A number is never issued twice.
exports.approve = async (req, res) => {
  if (!(await isApprover(req))) return res.status(403).json({ msg: 'Only Music Approvers can approve music' });
  const publish = ['now', 'date', 'hold'].includes(req.body?.publish) ? req.body.publish : 'now';
  const date = String(req.body?.date || '');
  if (publish === 'date' && (!DAY.test(date) || date < lagosDay())) return res.status(400).json({ msg: 'Choose today or a later date to publish' });
  const notify = req.body?.notify !== false;
  const me = req.user.id;
  const doc = await LibraryItem.findOneAndUpdate({ uid: req.params.uid, status: 'awaiting' }, { $set: { status: 'approving', approvingAt: new Date() } }, { new: true }).lean();
  if (!doc) {
    const cur = await LibraryItem.findOne({ uid: req.params.uid }, { code: 1, seal: 1, status: 1 }).lean();
    if (cur?.code) return res.status(409).json({ code: 'APPROVED', msg: `Already approved by ${cur.seal?.byName || 'another approver'} as ${cur.code}` });
    return res.status(409).json(busy());
  }
  try {
    const x = derive(doc);
    if (x.missing.length) throw Object.assign(new Error('missing'), { soft: 'Some required details are missing' });
    const series = doc.d?.type === 'instrumental' ? 'INS' : 'CHR';
    const n = await nextNumber(`lib${series}`);
    const code = `${series}-${pad(n)}`;
    const byName = await nameOf(me);
    const at = new Date();
    const seal = {
      code, byId: me, byName, at, self: doc.sentBy === me, rev: doc.rev, details: fingerprint(doc.d),
      files: (doc.files || []).map((f) => ({ fid: f.fid, kind: f.kind, part: f.part, version: f.version, etag: f.etag || null, size: f.size || 0, link: f.link || null })),
    };
    const now = publish === 'now';
    const done = await LibraryItem.findOneAndUpdate({ uid: doc.uid, status: 'approving' }, {
      $set: {
        status: now ? 'published' : 'approved', code, codeNo: n, series, seal, notifyOnPublish: notify,
        ...(now ? { publishedAt: at, live: false } : {}), ...(publish === 'date' ? { publishAt: new Date(`${date}T00:00:00+01:00`) } : {}),
      },
      $unset: { claim: '', approvingAt: '' },
      $push: { history: { $each: [{ at, by: me, byName, ev: 'Approved', detail: `${refOf(doc.qno)} → ${code}${seal.self ? ' (self-approved)' : ''}${now ? ', published' : publish === 'date' ? `, to publish on ${date}` : ', held'}` }], $slice: -200 } },
      $inc: { rev: 1 },
    }, { new: true }).lean();
    invalidate();
    if (now && notify) announcePublished(done);
    if (doc.sentBy && doc.sentBy !== me) push.toUsers([doc.sentBy], `${doc.d?.title || ''} was approved as ${code}${now ? ' and published' : ''}`, `lib-ok-${doc.uid}`);
    audit(req, 'LIBRARY_APPROVE', `${refOf(doc.qno)} approved as ${code}${seal.self ? ' (self-approved)' : ''}: ${doc.d?.title || ''}`);
    return res.json({ item: view(done, me) });
  } catch (e) {
    await LibraryItem.updateOne({ uid: doc.uid, status: 'approving' }, { $set: { status: 'awaiting' }, $unset: { approvingAt: '' } });
    if (e.soft) return res.status(400).json({ msg: e.soft });
    throw e;
  }
};

const publishOne = async (cond, req) => {
  const doc = await LibraryItem.findOneAndUpdate({ ...cond, status: 'approved' }, {
    $set: { status: 'published', publishedAt: new Date(), live: false }, $unset: { publishAt: '' },
    $push: { history: { $each: [{ at: new Date(), by: req?.user.id || '', byName: req ? await nameOf(req.user.id) : 'Schedule', ev: 'Published' }], $slice: -200 } }, $inc: { rev: 1 },
  }, { new: true }).lean();
  if (doc) { invalidate(); if (doc.notifyOnPublish !== false) announcePublished(doc); }
  return doc;
};
// Approved songs whose publish date has come (checked when the library is opened, and every 10 minutes)
let lastDue = 0;
const publishDue = async (force = false) => {
  if (!force && Date.now() - lastDue < 60000) return;
  lastDue = Date.now();
  const due = await LibraryItem.find({ status: 'approved', publishAt: { $lte: new Date() } }, { uid: 1 }).lean();
  for (const d of due) await publishOne({ uid: d.uid });
};

// POST /api/library/items/:uid/publish — publish an approved, held song now
exports.publish = async (req, res) => {
  if (!(await isApprover(req))) return res.status(403).json({ msg: 'Only Music Approvers can publish music' });
  const doc = await publishOne({ uid: req.params.uid }, req);
  if (!doc) return res.status(409).json({ msg: 'Only approved songs that are waiting can be published' });
  res.json({ item: view(doc, req.user.id) });
};

// GET /api/library/held — approved songs waiting for their publish date (or held)
exports.held = async (req, res) => {
  if (!(await isApprover(req))) return res.status(403).json({ msg: 'Only Music Approvers' });
  await publishDue();
  const rows = await LibraryItem.find({ status: 'approved' }, { uid: 1, qno: 1, code: 1, 'd.title': 1, publishAt: 1, seal: 1 }).sort({ codeNo: 1 }).lean();
  res.json({ items: rows.map((r) => ({ uid: r.uid, code: r.code, title: r.d?.title || '', publishAt: r.publishAt || null, approvedBy: r.seal?.byName, approvedAt: r.seal?.at })) });
};

// POST /api/library/items/:uid/urgent { reason } — needed straight away: members can use it at once, marked
// "Urgent · not yet reviewed". It keeps its Q number and stays in the queue until it is approved normally.
exports.urgent = async (req, res) => {
  if (!(await isApprover(req))) return res.status(403).json({ msg: 'Only Music Approvers can publish urgently' });
  const reason = text(req.body?.reason, 200);
  if (!reason) return res.status(400).json({ msg: 'Say why it is needed now (e.g. "Needed for Sunday")' });
  const byName = await nameOf(req.user.id);
  const at = new Date();
  const doc = await LibraryItem.findOneAndUpdate({ uid: req.params.uid, status: { $in: ['needs', 'ready', 'sent'] }, 'files.0': { $exists: true } }, {
    $set: { status: 'urgent', live: true, urgent: { reason, byId: req.user.id, byName, at } },
    $push: { history: { $each: [{ at, by: req.user.id, byName, ev: 'Published urgently', detail: reason }], $slice: -200 } }, $inc: { rev: 1 },
  }, { new: true }).lean();
  if (!doc) return res.status(409).json({ msg: 'Only music still in the queue (with a file) can be published urgently' });
  invalidate();
  announce(doc, 'urgent', `🎵 ${doc.d?.title || 'New music'} is available now (urgent, not yet reviewed)`);
  audit(req, 'LIBRARY_URGENT', `${refOf(doc.qno)} published urgently: ${doc.d?.title || ''} (${reason})`);
  res.json({ item: view(doc, req.user.id) });
};

/* ---------- the catalogue every member sees ---------- */
const VOICES = ['Soprano', 'Alto', 'Tenor', 'Bass'];
const visible = { $or: [{ status: 'published' }, { live: true }] };
const partsOf = (files) => {
  const has = new Set();
  for (const f of files || []) {
    if (f.part === 'Full' && /score|recording|lyrics|chord/i.test(f.kind)) VOICES.forEach((v) => has.add(v));
    const v = VOICES.find((x) => String(f.part || '').startsWith(x)); if (v) has.add(v);
  }
  return VOICES.filter((v) => has.has(v));
};
// Published songs give members only the files that match their approval seal
const sealedFiles = (doc) => {
  if (doc.status !== 'published' || !doc.seal) return doc.files || [];
  const ok = new Map((doc.seal.files || []).map((f) => [f.fid, f]));
  return (doc.files || []).filter((f) => { const s = ok.get(f.fid); return s && (s.etag || null) === (f.etag || null) && (s.size || 0) === (f.size || 0); });
};
const catCard = (doc) => ({
  uid: doc.uid, code: doc.code || null, ref: refOf(doc.qno), title: doc.d?.title || '', status: doc.status === 'published' ? 'published' : 'urgent',
  summary: [doc.d?.genre, doc.d?.choirKey, (doc.d?.massParts || [])[0] || (doc.d?.occasions || [])[0]].filter(Boolean).join(' · '),
  parts: partsOf(sealedFiles(doc)), files: sealedFiles(doc).length, type: doc.d?.type || 'song',
});

// GET /api/library/catalogue?type=&q=&sort=&page= — published music (and urgent music, marked), card fields only
exports.catalogue = async (req, res) => {
  await publishDue();
  const q = { ...visible };
  if (req.query.type === 'instrumental') q['d.type'] = 'instrumental';
  else if (req.query.type === 'song') q['d.type'] = { $ne: 'instrumental' };
  const words = text(req.query.q, 80).toLowerCase();
  if (words) q.search = { $regex: esc(words) };
  const sort = { title: { 'd.title': 1 }, newest: { publishedAt: -1, 'urgent.at': -1 } }[req.query.sort] || { series: 1, codeNo: 1, qno: 1 };
  const page = Math.max(1, Math.min(1000, Number(req.query.page) || 1));
  const [rows, total] = await Promise.all([
    LibraryItem.find(q, { uid: 1, qno: 1, code: 1, status: 1, 'd.title': 1, 'd.genre': 1, 'd.choirKey': 1, 'd.massParts': 1, 'd.occasions': 1, 'd.type': 1, 'files.fid': 1, 'files.kind': 1, 'files.part': 1, 'files.etag': 1, 'files.size': 1, seal: 1 })
      .collation({ locale: 'en', strength: 2 }).sort(sort).skip((page - 1) * PAGE).limit(PAGE).lean(),
    LibraryItem.countDocuments(q),
  ]);
  res.json({ items: rows.map(catCard), total, page, pages: Math.max(1, Math.ceil(total / PAGE)) });
};

// GET /api/library/catalogue/:uid — one song's page for members: details, copyright and its files
exports.song = async (req, res) => {
  const doc = await LibraryItem.findOne({ uid: req.params.uid, ...visible }).lean();
  if (!doc) return res.status(404).json({ msg: 'This music is not in the library' });
  res.json({
    song: {
      ...catCard(doc), d: doc.d || {}, files: sealedFiles(doc).map(fileView),
      approved: doc.status === 'published' && doc.seal ? { byName: doc.seal.byName, at: doc.seal.at, self: !!doc.seal.self, verified: sealedFiles(doc).length === (doc.files || []).length } : null,
      urgent: doc.status !== 'published' && doc.urgent?.at ? { reason: doc.urgent.reason, at: doc.urgent.at } : null,
      publishedAt: doc.publishedAt || null,
    },
  });
};

// Catalogue songs as simple song records, so Calendar setlists, My Account and search can use them
exports.catalogueAsSongs = async () => {
  await publishDue();
  // Only what a song list needs (titles, Mass parts and seasons, and each file's few identifying fields)
  const rows = await LibraryItem.find(visible, { uid: 1, qno: 1, code: 1, status: 1, 'd.title': 1, 'd.massParts': 1, 'd.occasions': 1, 'd.seasons': 1, 'files.fid': 1, 'files.id': 1, 'files.kind': 1, 'files.part': 1, 'files.mime': 1, 'files.name': 1, 'files.etag': 1, 'files.size': 1, 'seal.files': 1 }).lean();
  return rows.map((doc) => {
    const files = sealedFiles(doc);
    const play = files.find((f) => /^(audio|video)\//.test(f.mime || '') && f.id) || files.find((f) => f.id);
    return {
      id: doc.uid, title: doc.code ? `${doc.d?.title || ''}` : `${doc.d?.title || ''} (urgent, not yet reviewed)`, code: doc.code || refOf(doc.qno), catalogue: true,
      part: partsOf(files).length === 4 ? 'All parts' : partsOf(files).join(', '), categories: [...(doc.d?.massParts || []), ...(doc.d?.occasions || []), ...(doc.d?.seasons || [])],
      fileUrl: play?.id || '', fileName: play?.name || '', mime: play?.mime || '', format: play ? (/^audio/.test(play.mime) ? 'Audio' : 'PDF Score') : '',
    };
  });
};
exports.visibleIds = async (ids) => new Set((await LibraryItem.find({ uid: { $in: ids }, ...visible }, { uid: 1 }).lean()).map((d) => d.uid));

exports.FIELDS = FIELDS;
exports.REQUIRED = REQUIRED;
