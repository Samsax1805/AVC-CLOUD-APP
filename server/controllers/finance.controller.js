const User = require('../models/User');
const { FinanceBook, FinanceSheet } = require('../models/Finance');
const { Notification } = require('../models/records');
const security = require('../services/security.service');
const tombstones = require('../services/tombstones');
const { lagosNow } = require('../services/birthday.service');
const math = require('../services/financeMath');

// Who does what
//   preparers (Finance Secretary, admin): set up accounts, write each month, send it for review, roll back
//   reviewers (Secretary, President, admin): return a month with comments, or approve and publish it
//   everyone else who takes part (not Old Members): read published months and download the PDF
const PREPARE = ['admin', 'finance'];
const REVIEW = ['admin', 'president', 'secretary'];
const has = (roles = [], list) => !roles.includes('alumni') && roles.some((r) => list.includes(r));
const perms = (roles = []) => ({
  prepare: has(roles, PREPARE), review: has(roles, REVIEW), view: !roles.includes('alumni'), admin: has(roles, ['admin']),
});
const insider = (p) => p.prepare || p.review;

const LIMITS = { currencies: 12, cats: 60, entries: 1500, members: 400, text: 200, notes: 4000, versions: 60 };
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const today = () => lagosNow(new Date()).date;
const str = (v, n = LIMITS.text) => String(v ?? '').trim().slice(0, n);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const nameOf = async (id) => (await User.findById(id, { name: 1 }).lean().catch(() => null))?.name || 'Someone';
const fail = (res, code, msg, extra) => res.status(code).json({ msg, ...extra });
const listOf = (v, max = LIMITS.cats) => [...new Set((Array.isArray(v) ? v : []).map((x) => str(x, 60)).filter(Boolean))].slice(0, max);
const STATUS_LABEL = { draft: 'Draft', review: 'With the Secretary', returned: 'Returned for changes', published: 'Published' };

// ----- tidy what the page sends -----
const cleanCurrencies = (list) => {
  const out = [];
  for (const c of Array.isArray(list) ? list : []) {
    const code = str(c.code, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code || out.some((x) => x.code === code)) continue;
    out.push({ code, name: str(c.name, 40) || code, symbol: str(c.symbol, 4), opening: num(c.opening), rate: Math.max(0, Number(c.rate) || 0) });
  }
  return out.slice(0, LIMITS.currencies);
};
const cleanEntry = (e) => {
  const type = ['income', 'expense', 'exchange'].includes(e?.type) ? e.type : 'income';
  const out = {
    id: str(e?.id, 40) || `fe-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    date: /^\d{4}-\d{2}-\d{2}$/.test(e?.date) ? e.date : '',
    type, currency: str(e?.currency, 8).toUpperCase(), amount: Math.abs(num(e?.amount)), details: str(e?.details),
  };
  if (type === 'exchange') Object.assign(out, { toCurrency: str(e?.toCurrency, 8).toUpperCase(), toAmount: Math.abs(num(e?.toAmount)) });
  else Object.assign(out, { category: str(e?.category, 60), fund: str(e?.fund, 60) });
  return out;
};
const cleanMember = (m) => ({
  id: str(m?.id, 40) || `fm-${Math.random().toString(36).slice(2, 9)}`,
  memberId: str(m?.memberId, 40), name: str(m?.name, 80), dues: Math.abs(num(m?.dues)), lateness: Math.abs(num(m?.lateness)),
});
const cleanRates = (rates, book) => {
  const out = {};
  for (const c of book.currencies) {
    if (c.code === book.base) continue;
    const r = Number(rates?.[c.code]);
    out[c.code] = Number.isFinite(r) && r > 0 ? Math.round(r * 1e6) / 1e6 : (c.rate || 0);
  }
  return out;
};

const bookOut = (b) => ({
  id: String(b._id), name: b.name, base: b.base, currencies: b.currencies, incomeCats: b.incomeCats, expenseCats: b.expenseCats,
  funds: b.funds, startMonth: b.startMonth, createdAt: b.createdAt,
});
const stateOf = (s) => ({ entries: s.entries || [], rates: s.rates || {}, ratesDate: s.ratesDate || '', members: s.members || [], notes: s.notes || '' });
const sheetMeta = (s) => ({
  id: String(s._id), bookId: s.bookId, month: s.month, status: s.status, statusLabel: STATUS_LABEL[s.status], rev: s.rev,
  reviewNote: s.reviewNote || '', submittedAt: s.submittedAt, publishedAt: s.publishedAt, publishedByName: s.publishedByName || '',
  preparedByName: s.preparedByName || '', updatedAt: s.updatedAt, entryCount: (s.entries || []).length,
});
const keepVersion = (s, note, by) => {
  const v = s.nextV || 1;
  s.versions.push({ v, at: new Date(), byId: by.id, byName: by.name, note, ...JSON.parse(JSON.stringify(stateOf(s))) });
  s.nextV = v + 1;
  if (s.versions.length > LIMITS.versions) s.versions.splice(0, s.versions.length - LIMITS.versions);
};
const step = (s, action, note, by) => s.history.push({ action, note: str(note, 1000), at: new Date(), byId: by.id, byName: by.name });
const log = (req, detail, alert = false) => security.recordAction(req, 'finance', null, detail, alert);

// Every month of a book with its worked-out figures; members only ever see published months
const workBook = async (book, p) => {
  const F = await math.load();
  const sheets = await FinanceSheet.find({ bookId: String(book._id) }, { versions: 0 }).sort({ month: 1 }).lean();
  const reports = F.computeBook(book, sheets);
  const rows = sheets.map((s, i) => ({ sheet: s, report: reports[i] }));
  return { F, rows: insider(p) ? rows : rows.filter((x) => x.sheet.status === 'published') };
};
const cardOf = (sheet, report) => ({
  ...sheetMeta(sheet),
  close: report.combined.close, inc: report.combined.inc, exp: report.combined.exp, bf: report.combined.bf,
  closeBy: report.currencies.map((c) => ({ code: c.code, close: c.close })),
});

// ----- reading -----
exports.overview = async (req, res) => {
  const p = perms(req.user.roles);
  if (!p.view) return fail(res, 403, 'Old Members cannot see the choir accounts');
  const books = await FinanceBook.find().sort({ createdAt: 1 }).lean();
  const out = [];
  for (const b of books) {
    const { rows } = await workBook(b, p);
    out.push({ ...bookOut(b), months: rows.map((x) => cardOf(x.sheet, x.report)) });
  }
  res.json({ perms: p, books: insider(p) ? out : out.filter((b) => b.months.length), status: await exports.status(req.user.roles) });
};

// For the menu badge: how many months wait for this person
exports.status = async (roles = []) => {
  const p = perms(roles);
  if (!insider(p)) return null;
  const [review, returned] = await Promise.all([
    p.review ? FinanceSheet.countDocuments({ status: 'review' }) : 0,
    p.prepare ? FinanceSheet.countDocuments({ status: 'returned' }) : 0,
  ]);
  return { review, returned, waiting: review + returned };
};

// Published reports for the Documents page
exports.published = async (req, res) => {
  const p = perms(req.user.roles);
  if (!p.view) return res.json({ reports: [] });
  const books = new Map((await FinanceBook.find({}, { name: 1 }).lean()).map((b) => [String(b._id), b.name]));
  const list = await FinanceSheet.find({ status: 'published' }, { month: 1, bookId: 1, publishedAt: 1, publishedByName: 1, preparedByName: 1 }).sort({ month: -1 }).lean();
  res.json({ reports: list.map((s) => ({ id: String(s._id), month: s.month, book: books.get(s.bookId) || '', publishedAt: s.publishedAt, publishedByName: s.publishedByName || '', preparedByName: s.preparedByName || '' })) });
};

exports.sheet = async (req, res) => {
  const p = perms(req.user.roles);
  const s = await FinanceSheet.findById(req.params.id).lean().catch(() => null);
  if (!s || (!insider(p) && s.status !== 'published')) return fail(res, 404, 'That month was not found');
  const book = await FinanceBook.findById(s.bookId).lean();
  if (!book) return fail(res, 404, 'That account was not found');
  const { F, rows } = await workBook(book, p);
  const i = rows.findIndex((x) => String(x.sheet._id) === String(s._id));
  const mine = rows[i];
  const reports = rows.map((x) => x.report);
  const before = rows.filter((x) => x.sheet.month < s.month);
  const latest = rows.length ? rows[rows.length - 1].sheet.month : null;
  res.json({
    perms: p,
    book: bookOut(book),
    sheet: { ...sheetMeta(s), ...stateOf(s), history: s.history || [] },
    versions: p.prepare ? (s.versions || []).map(({ v, at, byName, note, entries }) => ({ v, at, byName, note, entryCount: (entries || []).length })).reverse() : [],
    bf: F.broughtForward(book, rows.map((x) => x.sheet), s.month),
    report: mine.report,
    history: reports.filter((r) => r.month <= s.month).map(F.historyRow),
    ytd: F.yearToDate(reports, s.month),
    isLatest: s.month === latest,
    earlierUnpublished: before.filter((x) => x.sheet.status !== 'published').map((x) => x.sheet.month),
    laterPublished: rows.some((x) => x.sheet.month > s.month && x.sheet.status === 'published'),
  });
};

// ----- account set-up -----
const readBook = (body, base) => {
  const currencies = cleanCurrencies(body.currencies);
  const baseCode = str(body.base || base, 8).toUpperCase();
  const b = currencies.find((c) => c.code === baseCode);
  if (b) b.rate = 1;
  return {
    name: str(body.name, 80), base: baseCode, currencies,
    incomeCats: listOf(body.incomeCats), expenseCats: listOf(body.expenseCats), funds: listOf(body.funds),
    startMonth: str(body.startMonth, 7),
  };
};

exports.createBook = async (req, res) => {
  const p = perms(req.user.roles);
  if (!p.prepare) return fail(res, 403, 'Only the Finance Secretary or an admin can set up an account');
  const b = readBook(req.body || {});
  if (!b.name) return fail(res, 400, 'Give the account a name');
  if (!MONTH_RE.test(b.startMonth)) return fail(res, 400, 'Choose the first month of the records');
  if (!b.currencies.length || !b.currencies.some((c) => c.code === b.base)) return fail(res, 400, 'Choose the main currency');
  if (b.currencies.some((c) => c.code !== b.base && !(c.rate > 0))) return fail(res, 400, 'Every other currency needs a rate');
  if (await FinanceBook.countDocuments() >= 10) return fail(res, 400, 'There are already 10 accounts');
  const book = await FinanceBook.create({ ...b, createdById: req.user.id });
  await log(req, `Set up the account "${b.name}" (${b.currencies.map((c) => c.code).join(', ')})`);
  res.json({ book: bookOut(book.toObject()) });
};

exports.updateBook = async (req, res) => {
  const p = perms(req.user.roles);
  if (!p.prepare) return fail(res, 403, 'Only the Finance Secretary or an admin can change the account');
  const book = await FinanceBook.findById(req.params.id).catch(() => null);
  if (!book) return fail(res, 404, 'That account was not found');
  const body = req.body || {};
  const next = readBook({ ...bookOut(book.toObject()), ...body }, book.base);
  if (!next.name) return fail(res, 400, 'Give the account a name');
  const sheets = await FinanceSheet.find({ bookId: String(book._id) }, { status: 1, entries: 1, month: 1 }).lean();
  const anyPublished = sheets.some((s) => s.status === 'published');
  const used = new Set(sheets.flatMap((s) => (s.entries || []).flatMap((e) => [e.currency, e.toCurrency]).filter(Boolean)));
  // Changing where the account starts would change months that members have already read
  if (anyPublished) {
    if (next.base !== book.base) return fail(res, 400, 'The main currency cannot change once a month is published');
    if (next.startMonth !== book.startMonth) return fail(res, 400, 'The first month cannot change once a month is published');
    for (const c of book.currencies) {
      const n = next.currencies.find((x) => x.code === c.code);
      if (n && num(n.opening) !== num(c.opening)) return fail(res, 400, `The opening balance of ${c.code} cannot change once a month is published. Record the difference as income or an expense instead.`);
    }
  } else if (sheets.length && next.startMonth !== book.startMonth) {
    if (!MONTH_RE.test(next.startMonth) || sheets.some((s) => s.month < next.startMonth)) return fail(res, 400, 'The first month must be on or before the first month already started');
  }
  if (!MONTH_RE.test(next.startMonth)) return fail(res, 400, 'Choose the first month of the records');
  if (!next.currencies.some((c) => c.code === next.base)) return fail(res, 400, 'The main currency must stay on the list');
  const dropped = book.currencies.filter((c) => !next.currencies.some((x) => x.code === c.code)).map((c) => c.code);
  const stillUsed = dropped.filter((c) => used.has(c));
  if (stillUsed.length) return fail(res, 400, `${stillUsed.join(', ')} is used in recorded entries and cannot be removed`);
  if (dropped.length && anyPublished && book.currencies.some((c) => dropped.includes(c.code) && num(c.opening))) return fail(res, 400, 'A currency with an opening balance cannot be removed once a month is published');
  if (next.currencies.some((c) => c.code !== next.base && !(c.rate > 0))) return fail(res, 400, 'Every other currency needs a rate');
  Object.assign(book, next);
  await book.save();
  await log(req, `Updated the set-up of the account "${book.name}"`);
  res.json({ book: bookOut(book.toObject()) });
};

exports.removeBook = async (req, res) => {
  const p = perms(req.user.roles);
  if (!p.admin) return fail(res, 403, 'Only an admin can delete an account');
  const book = await FinanceBook.findById(req.params.id).catch(() => null);
  if (!book) return fail(res, 404, 'That account was not found');
  if (await FinanceSheet.countDocuments({ bookId: String(book._id), status: 'published' })) return fail(res, 400, 'This account has published months and cannot be deleted');
  await FinanceSheet.deleteMany({ bookId: String(book._id) });
  await book.deleteOne();
  await log(req, `Deleted the account "${book.name}" (no month had been published)`, true);
  res.json({ ok: true });
};

// ----- months -----
// The next month follows on from the last one: its rates and member list start as a copy of the month before
exports.createMonth = async (req, res) => {
  const p = perms(req.user.roles);
  if (!p.prepare) return fail(res, 403, 'Only the Finance Secretary or an admin can start a month');
  const book = await FinanceBook.findById(req.params.id).lean().catch(() => null);
  if (!book) return fail(res, 404, 'That account was not found');
  const F = await math.load();
  const last = await FinanceSheet.findOne({ bookId: String(book._id) }, { versions: 0 }).sort({ month: -1 }).lean();
  const month = last ? F.monthAfter(last.month) : book.startMonth;
  const by = { id: req.user.id, name: await nameOf(req.user.id) };
  const s = new FinanceSheet({
    bookId: String(book._id), month, status: 'draft', entries: [],
    rates: last?.rates ? cleanRates(last.rates, book) : cleanRates({}, book),
    ratesDate: last?.ratesDate || '',
    members: (last?.members || []).map((m) => ({ ...cleanMember(m), dues: 0, lateness: 0 })),
    notes: '', preparedByName: by.name, history: [], versions: [],
  });
  step(s, 'started', last ? `Carried over from ${F.monthLabel(last.month)}` : 'First month of the account', by);
  try { await s.save(); } catch (e) {
    if (e.code === 11000) return fail(res, 409, `${F.monthLabel(month)} has already been started`);
    throw e;
  }
  await log(req, `Started ${F.monthLabel(month)} in "${book.name}"`);
  res.json({ id: String(s._id), month });
};

const editable = (s) => ['draft', 'returned'].includes(s.status);

exports.saveMonth = async (req, res) => {
  const p = perms(req.user.roles);
  if (!p.prepare) return fail(res, 403, 'Only the Finance Secretary or an admin can change the accounts');
  const s = await FinanceSheet.findById(req.params.id).catch(() => null);
  if (!s) return fail(res, 404, 'That month was not found');
  if (!editable(s)) return fail(res, 409, s.status === 'published' ? 'This month is published. Reopen it to make a correction.' : 'This month is with the Secretary. Take it back to make changes.', { status: s.status });
  const body = req.body || {};
  if (Number(body.rev) !== s.rev) return fail(res, 409, 'This month was changed somewhere else. The latest copy has been loaded.', { conflict: true });
  const book = await FinanceBook.findById(s.bookId).lean();
  const by = { id: req.user.id, name: await nameOf(req.user.id) };
  // A point to roll back to: before each sitting of edits (a new one after 10 minutes, or by someone else)
  const lastV = s.versions[s.versions.length - 1];
  // ...and always before a line or member is removed, so one deletion can be undone on its own
  const removing = (Array.isArray(body.entries) && body.entries.length < s.entries.length) || (Array.isArray(body.members) && body.members.length < s.members.length);
  if (removing) keepVersion(s, `Before a line was removed by ${by.name}`, by);
  else if (!lastV || lastV.byId !== by.id || Date.now() - new Date(lastV.at).getTime() > 10 * 60 * 1000) keepVersion(s, `Before changes by ${by.name}`, by);
  if (Array.isArray(body.entries)) s.entries = body.entries.slice(0, LIMITS.entries).map(cleanEntry);
  if (Array.isArray(body.members)) s.members = body.members.slice(0, LIMITS.members).map(cleanMember).filter((m) => m.name);
  if (body.rates) s.rates = cleanRates(body.rates, book);
  if (body.ratesDate !== undefined) s.ratesDate = /^\d{4}-\d{2}-\d{2}$/.test(body.ratesDate) ? body.ratesDate : '';
  if (body.notes !== undefined) s.notes = str(body.notes, LIMITS.notes);
  // Written only if nobody else saved in between (two open pages, or two saves at once): the other one is told to reload
  const set = { entries: s.entries, members: s.members, rates: s.rates, ratesDate: s.ratesDate, notes: s.notes, versions: s.versions, nextV: s.nextV, preparedByName: by.name, rev: s.rev + 1 };
  const done = await FinanceSheet.updateOne({ _id: s._id, rev: s.rev, status: { $in: ['draft', 'returned'] } }, { $set: JSON.parse(JSON.stringify(set)) });
  if (!done.matchedCount) return fail(res, 409, 'This month was changed somewhere else. The latest copy has been loaded.', { conflict: true });
  res.json({ rev: set.rev, versions: s.versions.length });
};

exports.action = async (req, res) => {
  const p = perms(req.user.roles);
  const { action, note } = req.body || {};
  const s = await FinanceSheet.findById(req.params.id).catch(() => null);
  if (!s) return fail(res, 404, 'That month was not found');
  const book = await FinanceBook.findById(s.bookId).lean();
  const F = await math.load();
  const label = F.monthLabel(s.month);
  const by = { id: req.user.id, name: await nameOf(req.user.id) };
  const others = await FinanceSheet.find({ bookId: s.bookId, _id: { $ne: s._id } }, { month: 1, status: 1 }).lean();

  if (action === 'submit') {
    if (!p.prepare) return fail(res, 403, 'Only the Finance Secretary or an admin can send a month for review');
    if (!editable(s)) return fail(res, 409, 'This month has already been sent');
    const all = await FinanceSheet.find({ bookId: s.bookId }, { versions: 0 }).lean();
    const report = F.computeSheet(book, s.toObject(), F.broughtForward(book, all, s.month));
    const { problems } = F.checkSheet(book, s.toObject(), report);
    if (problems.length) return fail(res, 400, 'Fix these first', { problems });
    keepVersion(s, 'As sent for review', by);
    s.status = 'review'; s.submittedAt = new Date(); s.reviewNote = '';
    step(s, 'submitted', note, by);
    await s.save();
    await log(req, `Sent ${label} (${book.name}) to the Secretary for review`);
  } else if (action === 'withdraw') {
    if (!p.prepare) return fail(res, 403, 'Only the Finance Secretary or an admin can take a month back');
    if (s.status !== 'review') return fail(res, 409, 'This month is not waiting for review');
    s.status = 'draft';
    step(s, 'withdrawn', note, by);
    await s.save();
  } else if (action === 'return') {
    if (!p.review) return fail(res, 403, 'Only the Secretary, President or an admin can return a month');
    if (s.status !== 'review') return fail(res, 409, 'This month is not waiting for review');
    if (!str(note)) return fail(res, 400, 'Say what needs changing');
    s.status = 'returned'; s.reviewNote = str(note, 1000);
    step(s, 'returned', note, by);
    await s.save();
    await log(req, `Returned ${label} (${book.name}) to the Finance Secretary: ${str(note, 120)}`);
  } else if (action === 'publish') {
    if (!p.review) return fail(res, 403, 'Only the Secretary, President or an admin can publish a month');
    if (s.status !== 'review') return fail(res, 409, 'Only a month sent for review can be published');
    const waiting = others.filter((o) => o.month < s.month && o.status !== 'published').map((o) => F.monthLabel(o.month));
    if (waiting.length) return fail(res, 400, `Publish ${waiting.join(', ')} first: this month carries on from it`);
    s.status = 'published'; s.publishedAt = new Date(); s.publishedById = by.id; s.publishedByName = by.name; s.reviewNote = '';
    step(s, 'published', note, by);
    await s.save();
    const uid = `fin-${s._id}-p${s.history.length}`;
    const again = s.history.filter((h) => h.action === 'published').length > 1;
    await Notification.updateOne({ uid }, { $setOnInsert: { uid, text: `The ${label} financial report is ${again ? 'corrected and published again' : 'published'}. Open Finance Reports to read it or download the PDF.`, date: today(), readBy: [] } }, { upsert: true });
    await log(req, `Published the ${label} financial report (${book.name})`);
  } else if (action === 'reopen') {
    if (!p.prepare && !p.review) return fail(res, 403, 'Only the Finance Secretary, Secretary, President or an admin can reopen a month');
    if (s.status !== 'published') return fail(res, 409, 'This month is not published');
    if (!str(note)) return fail(res, 400, 'Say why it is being reopened');
    const later = others.filter((o) => o.month > s.month && o.status === 'published').map((o) => F.monthLabel(o.month));
    if (later.length) return fail(res, 400, `Reopen ${later.join(', ')} first: it carries on from this month`);
    keepVersion(s, `As published on ${new Date(s.publishedAt || Date.now()).toISOString().slice(0, 10)}`, by);
    s.status = 'draft';
    step(s, 'reopened', note, by);
    await s.save();
    // The "published" notice goes, so members aren't sent to a month that is being corrected
    const notes = await Notification.find({ uid: { $regex: `^fin-${s._id}-` } }, { uid: 1 }).lean();
    const ids = notes.map((n) => n.uid);
    if (ids.length) { await Notification.deleteMany({ uid: { $in: ids } }); await tombstones.add('notifs', ids); }
    await log(req, `Reopened the published ${label} financial report (${book.name}) for correction: ${str(note, 120)}`, true);
  } else {
    return fail(res, 400, 'Unknown step');
  }
  res.json({ ok: true, status: s.status, rev: s.rev, finance: await exports.status(req.user.roles) });
};

// Roll back: put an earlier saved copy of the month back (the copy it replaces is kept too, so this can be undone)
exports.restore = async (req, res) => {
  const p = perms(req.user.roles);
  if (!p.prepare) return fail(res, 403, 'Only the Finance Secretary or an admin can roll back a month');
  const s = await FinanceSheet.findById(req.params.id).catch(() => null);
  if (!s) return fail(res, 404, 'That month was not found');
  if (!editable(s)) return fail(res, 409, s.status === 'published' ? 'Reopen this month first, then roll it back' : 'Take this month back from the Secretary first');
  const ver = s.versions.find((x) => x.v === Number(req.body?.v));
  if (!ver) return fail(res, 404, 'That saved copy was not found');
  const by = { id: req.user.id, name: await nameOf(req.user.id) };
  const copy = JSON.parse(JSON.stringify({ entries: ver.entries, rates: ver.rates, ratesDate: ver.ratesDate, members: ver.members, notes: ver.notes }));
  keepVersion(s, `Before rolling back to copy ${ver.v}`, by);
  Object.assign(s, { entries: copy.entries || [], rates: copy.rates || {}, ratesDate: copy.ratesDate || '', members: copy.members || [], notes: copy.notes || '' });
  s.rev += 1;
  step(s, 'rolled back', `To copy ${ver.v} (${ver.note})`, by);
  s.markModified('entries'); s.markModified('members'); s.markModified('rates');
  await s.save();
  const F = await math.load();
  await log(req, `Rolled back ${F.monthLabel(s.month)} to the copy saved ${new Date(ver.at).toISOString().slice(0, 16).replace('T', ' ')}`);
  res.json({ ok: true, rev: s.rev });
};

// Only the newest month can be deleted (a month in the middle would break the carry-over), and never a published one
exports.removeMonth = async (req, res) => {
  const p = perms(req.user.roles);
  if (!p.prepare) return fail(res, 403, 'Only the Finance Secretary or an admin can delete a month');
  const s = await FinanceSheet.findById(req.params.id).catch(() => null);
  if (!s) return fail(res, 404, 'That month was not found');
  if (s.status === 'published') return fail(res, 400, 'A published month cannot be deleted. Reopen it first.');
  const later = await FinanceSheet.countDocuments({ bookId: s.bookId, month: { $gt: s.month } });
  if (later) return fail(res, 400, 'Only the newest month can be deleted');
  await s.deleteOne();
  const F = await math.load();
  await log(req, `Deleted the unpublished month ${F.monthLabel(s.month)}`);
  res.json({ ok: true });
};

exports.perms = perms;
