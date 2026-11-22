const { isSystem } = require('../config/system');
const mongoose = require('mongoose');
const User = require('../models/User');
const PsalmDay = require('../models/PsalmDay');
const security = require('../services/security.service');
const reminders = require('../services/psalmist.service');

// The Choir Master, Assistant Choir Master, President and admin plan the roster; everyone else sees published days only
const PLANNERS = ['admin', 'president', 'choirmaster', 'asstchoirmaster'];
const canPlan = (roles = []) => !roles.includes('alumni') && roles.some((r) => PLANNERS.includes(r));
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PSALMISTS = 4;
const FIELDS = ['title', 'rank', 'season', 'color', 'cycle', 'note'];

const text = (v, max) => String(v ?? '').trim().slice(0, max);
const out = (d, names) => ({
  id: d._id.toString(), date: d.date, title: d.title, rank: d.rank, season: d.season, color: d.color, cycle: d.cycle,
  note: d.note || '', published: !!d.published, publishedAt: d.publishedAt || null,
  psalmists: (d.psalmistIds || []).map((id) => ({ id, name: names[id] || 'Former member' })),
});

// Psalmists must be active members (not Old Members)
const validPsalmists = async (ids) => {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(String))].slice(0, MAX_PSALMISTS);
  if (!list.every((id) => mongoose.isValidObjectId(id))) return null;
  const found = (await User.find({ _id: { $in: list }, status: 'active' }, { roles: 1, email: 1 }).lean()).filter((u) => !isSystem(u));
  return found.length === list.length && !found.some((u) => (u.roles || []).includes('alumni')) ? list : null;
};

// GET /api/psalmists?year=2026
exports.list = async (req, res) => {
  const year = /^\d{4}$/.test(req.query.year || '') ? req.query.year : String(new Date().getFullYear());
  const planner = canPlan(req.user.roles);
  const q = { date: { $gte: `${year}-01-01`, $lte: `${year}-12-31` }, ...(planner ? {} : { published: true }) };
  const [days, users] = await Promise.all([
    PsalmDay.find(q).sort({ date: 1, createdAt: 1 }).lean(),
    User.find({ status: 'active' }, { name: 1, section: 1, roles: 1, email: 1 }).lean().then((l) => l.filter((u) => !isSystem(u))),
  ]);
  const names = Object.fromEntries(users.map((u) => [String(u._id), u.name]));
  const missing = days.flatMap((d) => d.psalmistIds || []).filter((id) => !names[id] && mongoose.isValidObjectId(id));
  if (missing.length) (await User.find({ _id: { $in: missing } }, { name: 1 }).lean()).forEach((u) => { names[String(u._id)] = u.name; });
  res.json({
    year, canPlan: planner, days: days.map((d) => out(d, names)),
    members: planner ? users.filter((u) => !(u.roles || []).includes('alumni')).map((u) => ({ id: String(u._id), name: u.name, part: u.section || '' })).sort((a, b) => a.name.localeCompare(b.name)) : [],
  });
};

// POST /api/psalmists/batch { days: [{ date, title, rank, season, color, cycle }] } — adds a generated calendar, skipping days already there
exports.batch = async (req, res) => {
  if (!canPlan(req.user.roles)) return res.status(403).json({ msg: 'Only the Choir Master, Assistant, President or admin can plan the roster' });
  const days = (Array.isArray(req.body?.days) ? req.body.days : []).slice(0, 400).filter((d) => DATE.test(d?.date) && text(d.title, 200));
  const have = new Set((await PsalmDay.find({ date: { $in: days.map((d) => d.date) } }, { date: 1, title: 1 }).lean()).map((d) => `${d.date}|${d.title}`));
  const fresh = days.filter((d) => !have.has(`${d.date}|${text(d.title, 200)}`)).map((d) => ({
    date: d.date, ...Object.fromEntries(FIELDS.map((f) => [f, text(d[f], f === 'note' ? 500 : 200)])), psalmistIds: [], updatedBy: req.user.id,
  }));
  if (fresh.length) await PsalmDay.insertMany(fresh);
  res.json({ added: fresh.length, skipped: days.length - fresh.length });
};

// POST /api/psalmists { date, title, … psalmistIds } — one day or event
exports.create = async (req, res) => {
  if (!canPlan(req.user.roles)) return res.status(403).json({ msg: 'Only the Choir Master, Assistant, President or admin can plan the roster' });
  const b = req.body || {};
  if (!DATE.test(b.date || '')) return res.status(400).json({ msg: 'Choose a date' });
  if (!text(b.title, 200)) return res.status(400).json({ msg: 'Enter a title for the day' });
  const psalmistIds = await validPsalmists(b.psalmistIds);
  if (!psalmistIds) return res.status(400).json({ msg: 'Psalmists must be active members' });
  const day = await PsalmDay.create({ date: b.date, ...Object.fromEntries(FIELDS.map((f) => [f, text(b[f], f === 'note' ? 500 : 200)])), psalmistIds, updatedBy: req.user.id });
  res.json({ id: day._id.toString() });
};

// PATCH /api/psalmists/:id — title, psalmists, note, …; a changed date or psalmist gets fresh reminders
exports.update = async (req, res) => {
  if (!canPlan(req.user.roles)) return res.status(403).json({ msg: 'Only the Choir Master, Assistant, President or admin can plan the roster' });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ msg: 'Day not found' });
  const day = await PsalmDay.findById(req.params.id);
  if (!day) return res.status(404).json({ msg: 'Day not found' });
  const b = req.body || {};
  let changedPsalmists = null;
  if (b.date !== undefined) {
    if (!DATE.test(b.date)) return res.status(400).json({ msg: 'Choose a date' });
    if (b.date !== day.date) day.reminders = [];
    day.date = b.date;
  }
  if (b.title !== undefined && !text(b.title, 200)) return res.status(400).json({ msg: 'Enter a title for the day' });
  for (const f of FIELDS) if (b[f] !== undefined) day[f] = text(b[f], f === 'note' ? 500 : 200);
  if (b.psalmistIds !== undefined) {
    const ids = await validPsalmists(b.psalmistIds);
    if (!ids) return res.status(400).json({ msg: 'Psalmists must be active members' });
    const before = (day.psalmistIds || []).map(String);
    changedPsalmists = { added: ids.filter((id) => !before.includes(id)), removed: before.filter((id) => !ids.includes(id)) };
    day.reminders = (day.reminders || []).filter((r) => ids.includes(r.split(':')[0]));
    day.psalmistIds = ids;
  }
  day.updatedBy = req.user.id;
  await day.save();
  if (changedPsalmists && (changedPsalmists.added.length || changedPsalmists.removed.length)) {
    const names = Object.fromEntries((await User.find({ _id: { $in: [...changedPsalmists.added, ...changedPsalmists.removed] } }, { name: 1 }).lean()).map((u) => [String(u._id), u.name]));
    const list = (ids) => ids.map((id) => names[id] || 'a former member').join(', ');
    await security.recordAction(req, 'psalmist_changed', { id: req.user.id, name: 'Psalmist roster' },
      `${day.date} ${day.title}${day.published ? '' : ' (draft)'}: ${[changedPsalmists.added.length && `added ${list(changedPsalmists.added)}`, changedPsalmists.removed.length && `removed ${list(changedPsalmists.removed)}`].filter(Boolean).join('; ')}`);
    // Once a day is published, the people affected hear about it straight away (reminders still follow for the new ones)
    if (day.published) await reminders.notifyChange(day, changedPsalmists);
  }
  if (day.published) await reminders.run(new Date(), { ignoreHour: true });
  res.json({ ok: true });
};

// DELETE /api/psalmists/:id
exports.remove = async (req, res) => {
  if (!canPlan(req.user.roles)) return res.status(403).json({ msg: 'Only the Choir Master, Assistant, President or admin can plan the roster' });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ msg: 'Day not found' });
  await PsalmDay.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
};

// POST /api/psalmists/publish { ids, published } — members see only published days; due reminders go out straight away
exports.publish = async (req, res) => {
  if (!canPlan(req.user.roles)) return res.status(403).json({ msg: 'Only the Choir Master, Assistant, President or admin can publish the roster' });
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).filter((id) => mongoose.isValidObjectId(id)).slice(0, 400);
  const published = req.body?.published !== false;
  if (!ids.length) return res.status(400).json({ msg: 'Select at least one day' });
  const r = await PsalmDay.updateMany({ _id: { $in: ids } }, { $set: published ? { published: true, publishedAt: new Date(), publishedBy: req.user.id } : { published: false } });
  await security.recordAction(req, published ? 'roster_published' : 'roster_unpublished', { id: req.user.id, name: 'Psalmist roster' }, `${published ? 'Published' : 'Unpublished'} ${r.modifiedCount ?? ids.length} day(s)`);
  if (published) await reminders.run(new Date(), { ignoreHour: true });
  res.json({ ok: true, changed: r.modifiedCount ?? ids.length });
};

// POST /api/psalmists/import { rows, dryRun } — a year's calendar from a CSV file (read in the browser).
// Rows match existing days by date and title (or the only day on that date); blank cells keep what's there.
// New days arrive as drafts; publishing stays a separate step.
const sameTitle = (a, b) => String(a || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === String(b || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
exports.import = async (req, res) => {
  if (!canPlan(req.user.roles)) return res.status(403).json({ msg: 'Only the Choir Master, Assistant, President or admin can import the roster' });
  const dryRun = req.body?.dryRun !== false;
  const raw = (Array.isArray(req.body?.rows) ? req.body.rows : []).slice(0, 1000);
  if (!raw.length) return res.status(400).json({ msg: 'The file has no rows to import' });
  const rows = [];
  for (const [i, r] of raw.entries()) {
    if (!DATE.test(r?.date || '') || !text(r.title, 200)) return res.status(400).json({ msg: `Row ${i + 2}: a date and title are needed` });
    let psalmistIds = null;
    if (Array.isArray(r.psalmistIds)) {
      psalmistIds = await validPsalmists(r.psalmistIds);
      if (!psalmistIds) return res.status(400).json({ msg: `Row ${i + 2}: psalmists must be active members` });
    }
    rows.push({ ...Object.fromEntries(FIELDS.map((f) => [f, text(r[f], f === 'note' ? 500 : 200)])), date: r.date, psalmistIds });
  }
  const existing = await PsalmDay.find({ date: { $in: [...new Set(rows.map((r) => r.date))] } });
  const byDate = existing.reduce((m, d) => { (m[d.date] ||= []).push(d); return m; }, {});
  const rowsOnDate = rows.reduce((m, r) => { m[r.date] = (m[r.date] || 0) + 1; return m; }, {});
  const used = new Set();
  const out = { added: 0, updated: 0, unchanged: 0 };
  let publishedChanged = false;
  for (const r of rows) {
    const here = (byDate[r.date] || []).filter((d) => !used.has(d.id));
    const match = here.find((d) => sameTitle(d.title, r.title)) || (rowsOnDate[r.date] === 1 && here.length === 1 ? here[0] : null);
    if (!match) {
      out.added += 1;
      if (!dryRun) await PsalmDay.create({ date: r.date, ...Object.fromEntries(FIELDS.map((f) => [f, r[f]])), psalmistIds: r.psalmistIds || [], updatedBy: req.user.id });
      continue;
    }
    used.add(match.id);
    let changed = false;
    for (const f of FIELDS) if (r[f] && r[f] !== match[f]) { match[f] = r[f]; changed = true; }
    if (r.psalmistIds && r.psalmistIds.join() !== (match.psalmistIds || []).join()) {
      match.reminders = (match.reminders || []).filter((x) => r.psalmistIds.includes(x.split(':')[0]));
      match.psalmistIds = r.psalmistIds;
      changed = true;
    }
    if (!changed) { out.unchanged += 1; continue; }
    out.updated += 1;
    if (match.published) publishedChanged = true;
    if (!dryRun) { match.updatedBy = req.user.id; await match.save(); }
  }
  if (!dryRun) {
    await security.recordAction(req, 'roster_imported', { id: req.user.id, name: 'Psalmist roster' }, `CSV import: ${out.added} added, ${out.updated} updated`);
    if (publishedChanged) await reminders.run(new Date(), { ignoreHour: true });
  }
  res.json({ ...out, dryRun });
};
