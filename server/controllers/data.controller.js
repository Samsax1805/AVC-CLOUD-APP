const mongoose = require('mongoose');
const User = require('../models/User');
const R = require('../models/records');
const elections = require('./elections.controller');
const security = require('../services/security.service');
const tombstones = require('../services/tombstones');
const { isSystem } = require('../config/system');

const ROLE_LABEL = { admin: 'Admin', president: 'President', secretary: 'Secretary', provost: 'Provost', pro: 'PRO', choirmaster: 'Choir Master', asstchoirmaster: 'Assistant Choir Master', custodian: 'Custodian', electoral: 'Electoral Committee', finance: 'Finance Secretary', alumni: 'Old Member' };

const KEYS = {
  songs: R.Song, sessions: R.Session, debts: R.Debt, dues: R.Due, elections: R.Election,
  minutes: R.Minute, voiceNotes: R.VoiceNote, receipts: R.Receipt, announcements: R.Announcement,
  documents: R.ChoirDocument, probations: R.Probation, audit: R.AuditLog,
  duesSettings: R.DuesSetting, notifs: R.Notification,
};

// Executive roles that admins and the president may grant (README role table),
// plus 'alumni' (Old Member: view-only, replaces any executive role).
// The admin role itself never changes here: it is granted, removed or given up only through
// POST /api/security/admin-role, which asks for the admin's password (security.controller.js).
const GRANTABLE = ['president', 'secretary', 'finance', 'provost', 'pro', 'choirmaster', 'asstchoirmaster', 'custodian', 'electoral', 'alumni'];
const MANAGERS = ['admin', 'president'];

const nextRoles = (actorRoles, current, requested) => {
  if (!actorRoles.some((r) => MANAGERS.includes(r))) return current;
  let out = (requested || []).filter((r) => GRANTABLE.includes(r));
  // An admin stays an admin (and so can't be made an Old Member) until the role is handed over or given up
  if (current.includes('admin')) return ['admin', ...out.filter((r) => r !== 'alumni')];
  if (out.includes('alumni')) out = ['alumni'];
  return out.length ? out : ['member'];
};

const mapMember = (u) => ({
  id: u._id.toString(), name: u.name, email: u.email,
  roles: u.roles || ['member'], voice: u.section || null, section: u.section || null,
  avatar: u.avatar || null, dob: u.dob || '', country: u.country || '', phone: u.phone || '',
  provider: u.provider || 'local', joined: u.createdAt ? u.createdAt.toISOString().slice(0, 10) : '',
  status: u.status || 'active', color: '#1a2c60', system: isSystem(u),
});

exports.mapMember = mapMember;

exports.getAll = async (req, res) => {
  try {
    const out = {};
    for (const [key, M] of Object.entries(KEYS)) {
      const docs = await M.find().lean();
      out[key] = docs.map(({ _id, __v, createdAt, updatedAt, ...rest }) => ({ ...rest, id: rest.uid }));
    }
    out.elections = await elections.listFor(req.user.id); // vote totals only, never who chose whom
    out.electionStatus = await require('./electionCycle.controller').status(req.user.roles || []);
    out.financeStatus = await require('./finance.controller').status(req.user.roles || []);
    const misc = await R.Misc.find().lean();
    misc.forEach((m) => { out[m.key] = m.data; });
    out.nominations = out.nominations || {};
    out.roleHistory = out.roleHistory || [];
    out.pendingNoms = out.pendingNoms || [];

    const all = await User.find().lean();
    // Deactivated members stay in the list (status shown) so their history keeps its names
    // Officers who manage members also see when each account last signed in, to spot duplicate or unused accounts
    const seesSignIns = (req.user.roles || []).some((r) => ['admin', 'president', 'provost', 'pro'].includes(r)) && !(req.user.roles || []).includes('alumni');
    out.users = all.filter((u) => u.status !== 'pending').map((u) => (seesSignIns ? { ...mapMember(u), lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null, lastSeenAt: u.lastSeenAt ? new Date(u.lastSeenAt).toISOString() : null } : mapMember(u)));
    out.pendingUsers = all.filter((u) => u.status === 'pending').map(mapMember);
    res.json(out);
  } catch (e) {
    console.error('GET /data failed:', e.message);
    res.status(500).json({ msg: 'Failed to load data' });
  }
};

// Data-loss safeguards for the whole-state save:
// - a collection missing from the request is left alone (never wiped)
// - ordinary members and Old Members can add and update records but never delete them
// - officers may delete only a few records per save; anything bigger is refused before writing
const OFFICERS = ['admin', 'president', 'secretary', 'finance', 'provost', 'pro', 'choirmaster', 'asstchoirmaster', 'custodian', 'electoral'];
const MAX_DELETES_PER_SAVE = 3;

// Who may add, change or delete each kind of record (the same roles the website's buttons use).
// Everyone else's copy of these records is ignored, except the few things any member does
// themselves: checking in to a session, marking a notice as read, and adding to the audit log.
const WRITERS = {
  songs: ['admin', 'president', 'custodian'],
  voiceNotes: ['admin', 'president', 'custodian'],
  minutes: ['admin', 'president', 'secretary'],
  receipts: ['admin', 'president', 'secretary'],
  announcements: ['admin', 'president', 'secretary'],
  documents: ['admin', 'president', 'secretary'],
  debts: ['admin', 'president', 'provost'],
  sessions: ['admin', 'president', 'provost'],
  dues: ['admin', 'president', 'provost'],
  probations: ['admin', 'president', 'provost'],
  duesSettings: ['admin', 'president'],
  notifs: OFFICERS,
  audit: [], // append-only for everyone (see ownAudit)
  elections: [], // read-only history
};
const PROFILE_EDITORS = ['admin', 'president'];
const may = (roles, list) => !roles.includes('alumni') && roles.some((r) => list.includes(r));
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const plain = (d) => { if (!d) return d; const { _id, __v, createdAt, updatedAt, uid, ...rest } = d; return rest; };

// Marking a notice as read: only this member's name is added to who has read it
const ownRead = (item, before, me) => {
  if (!before || !(item.readBy || []).includes(me) || (before.readBy || []).includes(me)) return null;
  return { ...plain(before), readBy: [...(before.readBy || []), me] };
};
// Audit entries can be added but never changed, and always carry the real author
const ownAudit = (item, before, me) => {
  if (before) return null;
  return { userId: me, role: str(item.role, 120), action: str(item.action, 40), detail: str(item.detail, 600), time: str(item.time, 20) || new Date().toISOString().slice(0, 16).replace('T', ' ') };
};
// Checking in now goes through /api/attendance/checkin with a code signed by the server
const LIMITED = { notifs: ownRead, audit: ownAudit };
const keepCheckins = (next, before) => {
  const records = { ...(next.records || {}) };
  const checkins = [...(next.checkins || [])];
  for (const c of before.checkins || []) {
    if (!c?.userId) continue;
    if (!checkins.some((x) => x?.userId === c.userId)) checkins.push(c);
    const was = before.records instanceof Map ? before.records.get(c.userId) : (before.records || {})[c.userId];
    if (records[c.userId] === undefined && was) records[c.userId] = was;
  }
  return { ...next, records, checkins };
};

// Elections run through /api/elections (electionCycle.controller.js); old poll records here are read-only history.

exports.putAll = async (req, res) => {
  try {
    const body = req.body || {};
    const actorRoles = req.user.roles || [];
    const isOfficer = !actorRoles.includes('alumni') && actorRoles.some((r) => OFFICERS.includes(r));

    // Plan first, write nothing until every check has passed
    const plan = [];
    for (const [key, M] of Object.entries(KEYS)) {
      if (!Array.isArray(body[key])) continue;
      const ids = body[key].map((item) => item && (item.id || item.uid)).filter(Boolean);
      const docs = await M.find().lean();
      const existing = docs.map((d) => d.uid);
      // Birthday notices are created by the server, possibly after this browser loaded: never delete them here
      const removed = existing.filter((id) => !ids.includes(id) && !(key === 'notifs' && /^(bday|elec|fin|set)-/.test(String(id))));
      const full = may(actorRoles, WRITERS[key] || []);
      const mayDelete = full && key !== 'elections' && key !== 'audit';
      if (removed.length && mayDelete && removed.length > MAX_DELETES_PER_SAVE) {
        console.warn(`PUT /data refused: would delete ${removed.length} ${key} (user ${req.user.id})`);
        return res.status(409).json({ msg: `Save refused: it would delete ${removed.length} ${key} records at once. Reload the page and try again.` });
      }
      plan.push({ key, M, full, items: body[key], removed: mayDelete ? removed : [], saved: new Map(docs.map((d) => [d.uid, d])) });
    }
    if (!isOfficer) delete body.pendingNoms;
    for (const key of ['roleHistory', 'nominations']) {
      if (body[key] === undefined) continue;
      const cur = await R.Misc.findOne({ key }).lean();
      const before = Array.isArray(cur?.data) ? cur.data.length : Object.keys(cur?.data || {}).length;
      const after = Array.isArray(body[key]) ? body[key].length : Object.keys(body[key] || {}).length;
      if (!isOfficer || after < before) delete body[key]; // only officers write these, and they never shrink
    }

    // Only records that are new or actually changed are written, in one batch per collection
    // (the browser sends everything on every save; rewriting it all made saves slow)
    const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const gone = await tombstones.get(); // deleted on purpose by an admin: never put back from an old page
    let ignored = 0;
    for (const { key, M, full, items, removed, saved } of plan) {
      const ops = [];
      const deleted = new Set(gone[key] || []);
      for (const item of items) {
        const id = item && (item.id || item.uid);
        if (!id || typeof id !== 'string') continue;
        if (key === 'elections') continue; // elections run through /api/elections now
        if (deleted.has(String(id)) && !saved.has(id)) continue;
        const { id: _drop, _id, __v, createdAt, updatedAt, ...rest } = item;
        const before = saved.get(id);
        if (before && Object.keys(rest).every((k) => same(rest[k], before[k]))) continue;
        let next = rest;
        if (!full || LIMITED[key] === ownAudit) {
          next = LIMITED[key] ? LIMITED[key](rest, before, req.user.id) : null;
          if (!next) { ignored += 1; continue; }
        }
        // Members who checked themselves in after this officer opened the page are kept, not wiped
        if (key === 'sessions' && before) next = keepCheckins(next, before);
        ops.push({ updateOne: { filter: { uid: id }, update: { $set: { ...next, uid: id } }, upsert: true } });
      }
      if (ops.length) await M.bulkWrite(ops, { ordered: true });
      if (removed.length) {
        await M.deleteMany({ uid: { $in: removed } });
        if (key === 'elections') await R.Ballot.deleteMany({ electionId: { $in: removed } });
      }
    }
    for (const key of ['nominations', 'roleHistory', 'pendingNoms']) {
      if (body[key] !== undefined) {
        await R.Misc.updateOne({ key }, { key, data: body[key] }, { upsert: true });
      }
    }
    // Account status (approve / reject / deactivate / reactivate) and other members' parts only change
    // via /api/members, so an out-of-date copy of the list in someone's browser can't undo them
    if (Array.isArray(body.users)) {
      // Everyone is read once; only members whose details or roles actually change are written
      const all = await User.find({}, { name: 1, email: 1, roles: 1, status: 1, section: 1, avatar: 1, dob: 1, country: 1, phone: 1 }).lean();
      const byId = new Map(all.map((u) => [String(u._id), u]));
      const byEmail = new Map(all.map((u) => [String(u.email || '').toLowerCase(), u]));
      let adminCount = all.filter((u) => (u.roles || []).includes('admin') && u.status === 'active').length;
      for (const mu of body.users) {
        const existing = mongoose.isValidObjectId(mu.id) ? byId.get(String(mu.id)) : byEmail.get(String(mu.email || '').toLowerCase());
        if (!existing || existing.status === 'pending') continue;
        // Members change only their own details; the President and admins may correct anyone's
        if (existing._id.toString() !== req.user.id && !may(actorRoles, PROFILE_EDITORS)) continue;
        const before = existing.roles || ['member'];
        // A browser that loaded the list before someone else changed this member's roles must not undo that
        // change: role edits only apply when the roles it started from still match what is saved
        const sameRoles = (x, y) => [...new Set(x)].sort().join() === [...new Set(y)].sort().join();
        const stale = Array.isArray(mu.rolesBase) && !sameRoles(mu.rolesBase.length ? mu.rolesBase : ['member'], before);
        const roles = stale ? before : nextRoles(actorRoles, before, mu.roles);
        const next = {
          name: mu.name, roles,
          section: existing._id.toString() === req.user.id ? (mu.voice || mu.section || null) : (existing.section || null),
          avatar: mu.avatar || null, dob: mu.dob || '', country: mu.country || '', phone: mu.phone || '',
        };
        const unchanged = sameRoles(roles, before) && ['name', 'section', 'avatar', 'dob', 'country', 'phone'].every((k) => same(next[k] || null, existing[k] || null));
        if (unchanged) continue;
        await User.updateOne({ _id: existing._id }, { $set: next });
        if (before.includes('admin') !== roles.includes('admin') && existing.status === 'active') adminCount += roles.includes('admin') ? 1 : -1;
        // Role changes are recorded by the server for the Security page; a new admin is emailed to the admins
        for (const r of roles.filter((x) => x !== 'member' && !before.includes(x))) {
          await security.recordAction(req, 'role_granted', existing, `Granted ${ROLE_LABEL[r] || r}`, r === 'admin');
          if (r === 'admin') security.alertAdmins(`New admin: ${existing.name}`, [`${existing.name} (${existing.email}) was given the Admin role.`, 'If you did not expect this, check the Security page.']);
        }
        for (const r of before.filter((x) => x !== 'member' && !roles.includes(x))) {
          await security.recordAction(req, 'role_revoked', existing, `Removed ${ROLE_LABEL[r] || r}`);
        }
      }
    }
    if (ignored) console.warn(`PUT /data: ignored ${ignored} record change(s) the user may not make (user ${req.user.id})`);
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /data failed:', e.message);
    res.status(500).json({ msg: 'Failed to save data' });
  }
};