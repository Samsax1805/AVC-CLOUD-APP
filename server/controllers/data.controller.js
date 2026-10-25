const mongoose = require('mongoose');
const User = require('../models/User');
const R = require('../models/records');

const KEYS = {
  songs: R.Song, sessions: R.Session, debts: R.Debt, dues: R.Due, elections: R.Election,
  minutes: R.Minute, voiceNotes: R.VoiceNote, receipts: R.Receipt, announcements: R.Announcement,
  documents: R.ChoirDocument, probations: R.Probation, audit: R.AuditLog,
  duesSettings: R.DuesSetting, notifs: R.Notification,
};

// Executive roles that admins and the president may grant (README role table),
// plus 'alumni' (Old Member: view-only, replaces any executive role).
// Only an admin may grant or remove 'admin', and the last admin can't be removed.
const GRANTABLE = ['president', 'secretary', 'provost', 'custodian', 'electoral', 'alumni'];
const MANAGERS = ['admin', 'president'];

const nextRoles = (actorRoles, current, requested, adminCount) => {
  const isAdmin = actorRoles.includes('admin');
  if (!actorRoles.some((r) => MANAGERS.includes(r))) return current;
  let out = (requested || []).filter((r) => GRANTABLE.includes(r));
  if (out.includes('alumni')) out = ['alumni'];
  const hadAdmin = current.includes('admin');
  const wantsAdmin = (requested || []).includes('admin');
  if (isAdmin ? (wantsAdmin || (hadAdmin && adminCount <= 1)) : hadAdmin) out.unshift('admin');
  return out.length ? out : ['member'];
};

const mapMember = (u) => ({
  id: u._id.toString(), name: u.name, email: u.email,
  roles: u.roles || ['member'], voice: u.section || null, section: u.section || null,
  avatar: u.avatar || null, dob: u.dob || '', country: u.country || '', phone: u.phone || '',
  provider: u.provider || 'local', joined: u.createdAt ? u.createdAt.toISOString().slice(0, 10) : '',
  status: u.status || 'active', color: '#1a2c60',
});

exports.getAll = async (req, res) => {
  try {
    const out = {};
    for (const [key, M] of Object.entries(KEYS)) {
      const docs = await M.find().lean();
      out[key] = docs.map(({ _id, __v, createdAt, updatedAt, ...rest }) => ({ ...rest, id: rest.uid }));
    }
    const misc = await R.Misc.find().lean();
    misc.forEach((m) => { out[m.key] = m.data; });
    out.nominations = out.nominations || {};
    out.roleHistory = out.roleHistory || [];
    out.pendingNoms = out.pendingNoms || [];

    const all = await User.find().lean();
    // Deactivated members stay in the list (status shown) so their history keeps its names
    out.users = all.filter((u) => u.status !== 'pending').map(mapMember);
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
const OFFICERS = ['admin', 'president', 'secretary', 'provost', 'custodian', 'electoral'];
const MAX_DELETES_PER_SAVE = 3;

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
      const existing = (await M.find({}, { uid: 1 }).lean()).map((d) => d.uid);
      const removed = existing.filter((id) => !ids.includes(id));
      if (removed.length && isOfficer && removed.length > MAX_DELETES_PER_SAVE) {
        console.warn(`PUT /data refused: would delete ${removed.length} ${key} (user ${req.user.id})`);
        return res.status(409).json({ msg: `Save refused: it would delete ${removed.length} ${key} records at once. Reload the page and try again.` });
      }
      plan.push({ M, items: body[key], removed: isOfficer ? removed : [] });
    }
    for (const key of ['roleHistory', 'nominations']) {
      if (body[key] === undefined) continue;
      const cur = await R.Misc.findOne({ key }).lean();
      const before = Array.isArray(cur?.data) ? cur.data.length : Object.keys(cur?.data || {}).length;
      const after = Array.isArray(body[key]) ? body[key].length : Object.keys(body[key] || {}).length;
      if (!isOfficer || after < before) delete body[key]; // only officers write these, and they never shrink
    }

    for (const { M, items, removed } of plan) {
      for (const item of items) {
        const id = item && (item.id || item.uid);
        if (!id) continue;
        const { id: _drop, ...rest } = item;
        await M.updateOne({ uid: id }, { $set: { ...rest, uid: id } }, { upsert: true });
      }
      if (removed.length) await M.deleteMany({ uid: { $in: removed } });
    }
    for (const key of ['nominations', 'roleHistory', 'pendingNoms']) {
      if (body[key] !== undefined) {
        await R.Misc.updateOne({ key }, { key, data: body[key] }, { upsert: true });
      }
    }
    // Account status (approve / reject / deactivate / reactivate) only changes via /api/members
    if (Array.isArray(body.users)) {
      for (const mu of body.users) {
        const q = mongoose.isValidObjectId(mu.id) ? { _id: mu.id } : { email: (mu.email || '').toLowerCase() };
        const existing = await User.findOne(q).lean();
        if (!existing || existing.status === 'pending') continue;
        const adminCount = await User.countDocuments({ roles: 'admin', status: 'active' });
        await User.updateOne({ _id: existing._id }, {
          $set: {
            name: mu.name, roles: nextRoles(actorRoles, existing.roles || ['member'], mu.roles, adminCount),
            section: mu.voice || mu.section || null,
            avatar: mu.avatar || null, dob: mu.dob || '', country: mu.country || '', phone: mu.phone || '',
          },
        });
      }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /data failed:', e.message);
    res.status(500).json({ msg: 'Failed to save data' });
  }
};