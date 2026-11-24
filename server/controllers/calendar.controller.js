const crypto = require('crypto');
const User = require('../models/User');
const PsalmDay = require('../models/PsalmDay');
const { Event, Setlist } = require('../models/Calendar');
const { Song, Notification } = require('../models/records');
const tombstones = require('../services/tombstones');
const security = require('../services/security.service');
const push = require('../services/push.service');

// Who plans what
//   events (rehearsals, services, meetings): admin, President, Secretary, Provost, Choir Master, Assistant
//   setlists (songs for a day): admin, President, Choir Master, Assistant Choir Master
// Everyone else sees the events and the published setlists.
const EVENT_PLANNERS = ['admin', 'president', 'secretary', 'provost', 'choirmaster', 'asstchoirmaster'];
const SETLIST_PLANNERS = ['admin', 'president', 'choirmaster', 'asstchoirmaster'];
const TYPES = ['rehearsal', 'service', 'meeting', 'social', 'other'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const may = (roles = [], list) => !roles.includes('alumni') && roles.some((r) => list.includes(r));
const perms = (roles) => ({ events: may(roles, EVENT_PLANNERS), setlists: may(roles, SETLIST_PLANNERS) });
const text = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const nameOf = async (id) => (await User.findById(id, { name: 1 }).lean())?.name || '';
const shapeEvent = (e) => ({ id: String(e._id), date: e.date, start: e.start || '', end: e.end || '', title: e.title, type: e.type, place: e.place || '', notes: e.notes || '', seriesId: e.seriesId || null, by: e.createdByName || '' });
const shapeSet = (s) => ({ id: String(s._id), date: s.date, title: s.title || '', items: s.items || [], notes: s.notes || '', published: !!s.published, publishedAt: s.publishedAt || null, by: s.updatedByName || '' });
const dayLabel = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD — events, setlists and the psalmist roster for those days
exports.list = async (req, res) => {
  const p = perms(req.user.roles || []);
  const from = DATE.test(req.query.from || '') ? req.query.from : addDays(new Date().toISOString().slice(0, 10), -31);
  let to = DATE.test(req.query.to || '') ? req.query.to : addDays(from, 92);
  if (to < from) to = from;
  if (addDays(from, 400) < to) to = addDays(from, 400);
  const range = { date: { $gte: from, $lte: to } };
  const [events, setlists, psalms] = await Promise.all([
    Event.find(range).sort({ date: 1, start: 1 }).lean(),
    Setlist.find({ ...range, ...(p.setlists ? {} : { published: true }) }).sort({ date: 1 }).lean(),
    PsalmDay.find({ ...range, published: true }, { date: 1, title: 1, psalmistIds: 1 }).lean(),
  ]);
  const ids = [...new Set(psalms.flatMap((d) => d.psalmistIds || []))];
  const names = Object.fromEntries((await User.find({ _id: { $in: ids.filter((x) => /^[0-9a-f]{24}$/.test(x)) } }, { name: 1 }).lean()).map((u) => [String(u._id), u.name]));
  res.json({
    from, to, perms: p,
    events: events.map(shapeEvent),
    setlists: setlists.map(shapeSet),
    psalmists: psalms.map((d) => ({ date: d.date, title: d.title || '', people: (d.psalmistIds || []).map((id) => ({ id, name: names[id] || 'Former member' })) })),
  });
};

// POST /api/calendar/events { date, start, end, title, type, place, notes, repeatWeeks }
exports.createEvent = async (req, res) => {
  if (!perms(req.user.roles).events) return res.status(403).json({ msg: 'Only officers who plan the choir\'s week can add events' });
  const b = req.body || {};
  if (!DATE.test(b.date || '')) return res.status(400).json({ msg: 'Choose a date' });
  const title = text(b.title, 100);
  if (!title) return res.status(400).json({ msg: 'Give the event a name' });
  if ((b.start && !TIME.test(b.start)) || (b.end && !TIME.test(b.end))) return res.status(400).json({ msg: 'Times look like 18:30' });
  if (b.start && b.end && b.end <= b.start) return res.status(400).json({ msg: 'The end time must be after the start' });
  const weeks = Math.max(1, Math.min(52, parseInt(b.repeatWeeks, 10) || 1));
  const seriesId = weeks > 1 ? crypto.randomUUID() : null;
  const byName = await nameOf(req.user.id);
  const base = { start: b.start || '', end: b.end || '', title, type: TYPES.includes(b.type) ? b.type : 'other', place: text(b.place, 120), notes: text(b.notes, 1000), seriesId, createdById: req.user.id, createdByName: byName };
  const made = await Event.insertMany(Array.from({ length: weeks }, (_, i) => ({ ...base, date: addDays(b.date, i * 7) })));
  security.recordAction(req, 'calendar', { id: req.user.id, name: 'Calendar' }, `Added "${title}" on ${b.date}${weeks > 1 ? ` (every week, ${weeks} times)` : ''}`).catch(() => {});
  res.json({ ok: true, events: made.map((e) => shapeEvent(e.toObject())) });
};

// PUT /api/calendar/events/:id { …fields, series: true } — series: also this event's later weeks
exports.updateEvent = async (req, res) => {
  if (!perms(req.user.roles).events) return res.status(403).json({ msg: 'Only officers who plan the choir\'s week can change events' });
  const e = await Event.findById(String(req.params.id)).catch(() => null);
  if (!e) return res.status(404).json({ msg: 'Event not found' });
  const b = req.body || {};
  const set = {};
  if (b.title !== undefined) { set.title = text(b.title, 100); if (!set.title) return res.status(400).json({ msg: 'Give the event a name' }); }
  if (b.start !== undefined) { if (b.start && !TIME.test(b.start)) return res.status(400).json({ msg: 'Times look like 18:30' }); set.start = b.start; }
  if (b.end !== undefined) { if (b.end && !TIME.test(b.end)) return res.status(400).json({ msg: 'Times look like 18:30' }); set.end = b.end; }
  const start = set.start ?? e.start; const end = set.end ?? e.end;
  if (start && end && end <= start) return res.status(400).json({ msg: 'The end time must be after the start' });
  if (b.type !== undefined) set.type = TYPES.includes(b.type) ? b.type : 'other';
  if (b.place !== undefined) set.place = text(b.place, 120);
  if (b.notes !== undefined) set.notes = text(b.notes, 1000);
  if (b.date !== undefined && !b.series) { if (!DATE.test(b.date)) return res.status(400).json({ msg: 'Choose a date' }); set.date = b.date; }
  const filter = b.series && e.seriesId ? { seriesId: e.seriesId, date: { $gte: e.date } } : { _id: e._id };
  const r = await Event.updateMany(filter, { $set: set });
  res.json({ ok: true, changed: r.modifiedCount });
};

// DELETE /api/calendar/events/:id?series=1 — series: also this event's later weeks
exports.removeEvent = async (req, res) => {
  if (!perms(req.user.roles).events) return res.status(403).json({ msg: 'Only officers who plan the choir\'s week can remove events' });
  const e = await Event.findById(String(req.params.id)).catch(() => null);
  if (!e) return res.status(404).json({ msg: 'Event not found' });
  const filter = req.query.series === '1' && e.seriesId ? { seriesId: e.seriesId, date: { $gte: e.date } } : { _id: e._id };
  const r = await Event.deleteMany(filter);
  security.recordAction(req, 'calendar', { id: req.user.id, name: 'Calendar' }, `Removed "${e.title}" on ${e.date}${r.deletedCount > 1 ? ` and ${r.deletedCount - 1} later week(s)` : ''}`).catch(() => {});
  res.json({ ok: true, removed: r.deletedCount });
};

// PUT /api/calendar/setlists/:date { title, items: [{ songId, label, note }], notes, published }
exports.saveSetlist = async (req, res) => {
  if (!perms(req.user.roles).setlists) return res.status(403).json({ msg: 'Only the Choir Master, Assistant, President or an admin can plan the songs' });
  const date = String(req.params.date);
  if (!DATE.test(date)) return res.status(400).json({ msg: 'Choose a date' });
  const b = req.body || {};
  const raw = (Array.isArray(b.items) ? b.items : []).slice(0, 40);
  const songIds = [...new Set(raw.map((i) => String(i?.songId || '')))].filter(Boolean);
  const known = new Set((await Song.find({ uid: { $in: songIds } }, { uid: 1 }).lean()).map((s) => s.uid));
  // …or music published in the catalogue (CHR / INS, or urgent)
  for (const id of await require('./library.controller').visibleIds(songIds.filter((x) => !known.has(x)))) known.add(id);
  const items = raw.filter((i) => known.has(String(i?.songId))).map((i) => ({ songId: String(i.songId), label: text(i.label, 40), note: text(i.note, 200) }));
  const before = await Setlist.findOne({ date }).lean();
  const published = !!b.published;
  if (published && !items.length) return res.status(400).json({ msg: 'Add at least one song before publishing' });
  const byName = await nameOf(req.user.id);
  const saved = await Setlist.findOneAndUpdate(
    { date },
    { $set: { title: text(b.title, 100), items, notes: text(b.notes, 1000), published, publishedAt: published ? (before?.publishedAt || new Date()) : null, updatedById: req.user.id, updatedByName: byName } },
    { upsert: true, new: true },
  ).lean();
  // Members hear about it the first time it is published; unpublishing takes the notice back
  const uid = `set-${date}`;
  if (published && !before?.published) {
    const note = `🎵 The songs for ${dayLabel(date)}${saved.title ? ` (${saved.title})` : ''} are ready on the Calendar.`;
    const r = await Notification.updateOne({ uid }, { $setOnInsert: { uid, text: note, date: new Date().toISOString().slice(0, 10), readBy: [] } }, { upsert: true });
    if (r.upsertedCount) push.toAll(note, uid);
    security.recordAction(req, 'calendar', { id: req.user.id, name: 'Calendar' }, `Published the setlist for ${date} (${items.length} songs)`).catch(() => {});
  }
  if (!published && before?.published) { await Notification.deleteOne({ uid }); await tombstones.add('notifs', [uid]); }
  res.json({ ok: true, setlist: shapeSet(saved), dropped: raw.length - items.length });
};

// DELETE /api/calendar/setlists/:date
exports.removeSetlist = async (req, res) => {
  if (!perms(req.user.roles).setlists) return res.status(403).json({ msg: 'Only the Choir Master, Assistant, President or an admin can plan the songs' });
  const date = String(req.params.date);
  const s = await Setlist.findOneAndDelete({ date }).lean();
  if (!s) return res.status(404).json({ msg: 'No setlist for that day' });
  if (s.published) { await Notification.deleteOne({ uid: `set-${date}` }); await tombstones.add('notifs', [`set-${date}`]); }
  res.json({ ok: true });
};
