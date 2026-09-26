const mongoose = require('mongoose');
const User = require('../models/User');
const R = require('../models/records');

const KEYS = {
  songs: R.Song, sessions: R.Session, debts: R.Debt, dues: R.Due, elections: R.Election,
  minutes: R.Minute, voiceNotes: R.VoiceNote, receipts: R.Receipt, announcements: R.Announcement,
  documents: R.ChoirDocument, probations: R.Probation, audit: R.AuditLog,
  duesSettings: R.DuesSetting, notifs: R.Notification,
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
    out.users = all.filter((u) => u.status === 'active').map(mapMember);
    out.pendingUsers = all.filter((u) => u.status === 'pending').map(mapMember);
    res.json(out);
  } catch (e) {
    console.error('GET /data failed:', e.message);
    res.status(500).json({ msg: 'Failed to load data' });
  }
};

exports.putAll = async (req, res) => {
  try {
    const body = req.body || {};
    for (const [key, M] of Object.entries(KEYS)) {
      const list = Array.isArray(body[key]) ? body[key] : [];
      const ids = [];
      for (const item of list) {
        const id = item.id || item.uid;
        if (!id) continue;
        ids.push(id);
        const { id: _drop, ...rest } = item;
        await M.updateOne({ uid: id }, { $set: { ...rest, uid: id } }, { upsert: true });
      }
      await M.deleteMany({ uid: { $nin: ids } });
    }
    for (const key of ['nominations', 'roleHistory', 'pendingNoms']) {
      if (body[key] !== undefined) {
        await R.Misc.updateOne({ key }, { key, data: body[key] }, { upsert: true });
      }
    }
    if (Array.isArray(body.users)) {
      for (const mu of body.users) {
        const q = mongoose.isValidObjectId(mu.id) ? { _id: mu.id } : { email: (mu.email || '').toLowerCase() };
        await User.updateOne(q, {
          $set: {
            name: mu.name, roles: mu.roles || ['member'], section: mu.voice || mu.section || null,
            avatar: mu.avatar || null, dob: mu.dob || '', country: mu.country || '', phone: mu.phone || '',
            status: mu.status || 'active',
          },
        });
      }
    }
    if (Array.isArray(body.pendingUsers)) {
      const keep = body.pendingUsers.map((p) => (p.email || '').toLowerCase());
      await User.deleteMany({ status: 'pending', email: { $nin: keep } });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /data failed:', e.message);
    res.status(500).json({ msg: 'Failed to save data' });
  }
};