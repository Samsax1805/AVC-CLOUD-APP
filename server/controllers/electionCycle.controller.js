const User = require('../models/User');
const Cycle = require('../models/ElectionCycle');
const { Election, Ballot, Notification } = require('../models/records');
const security = require('../services/security.service');
const { lagosNow } = require('../services/birthday.service');
const tombstones = require('../services/tombstones');
const SecurityEvent = require('../models/SecurityEvent');
const { AuditLog } = require('../models/records');

// Who does what
//   committee (Electoral Committee, admin): offices, eligibility, nominations, candidates, publishing those
//   overseers (committee + President): go live, close voting, run-offs, see live results, publish results
//   voters: every active member who is not an Old Member
//   appointers (admin, President): choose the Electoral Committee
const COMMITTEE = ['admin', 'electoral'];
const OVERSEE = ['admin', 'electoral', 'president'];
const APPOINT = ['admin', 'president'];
const has = (roles = [], list) => !roles.includes('alumni') && roles.some((r) => list.includes(r));
const perms = (roles) => ({
  committee: has(roles, COMMITTEE), oversee: has(roles, OVERSEE), appoint: has(roles, APPOINT), admin: has(roles, ['admin']),
  vote: !roles.includes('alumni'),
});

const MAX_OFFICES = 30;
const ACTIVE = { stage: { $ne: 'archived' } };
const VOTING = ['live', 'closed', 'published'];
// Round 1 keeps the original key so earlier ballots stay valid; run-off rounds get their own
const ballotKey = (cycle, o) => `${cycle._id}:${o.name}${(o.round || 1) > 1 ? `#r${o.round}` : ''}`;
const today = () => lagosNow(new Date()).date;
const STAGE_LABEL = {
  setup: 'Setting up', nominations: 'Nominations open', review: 'Choosing candidates', ballot: 'Candidates published',
  live: 'Voting live', closed: 'Voting closed', published: 'Results published', archived: 'Archived',
};
const label = (cycle) => (cycle.runoff && ['ballot', 'live', 'closed'].includes(cycle.stage) ? `Run-off: ${STAGE_LABEL[cycle.stage].toLowerCase()}` : STAGE_LABEL[cycle.stage]);

// Everyone's name and part, read once and reused for 15 seconds: the page asks often, the choir list rarely changes
let people = { at: 0, list: null, pending: null };
const roster = async () => {
  if (people.list && Date.now() - people.at < 15000) return people.list;
  if (!people.pending) {
    people.pending = User.find({ status: { $ne: 'pending' } }, { name: 1, section: 1, roles: 1, status: 1 }).lean()
      .then((list) => { people = { at: Date.now(), list: list.map((u) => ({ id: String(u._id), name: u.name, part: u.section || '', roles: u.roles || [], status: u.status || 'active' })), pending: null }; return people.list; })
      .catch((e) => { people.pending = null; throw e; });
  }
  return people.pending;
};
const directory = async () => {
  const list = await roster();
  const byId = new Map(list.map((u) => [u.id, u]));
  const who = (id) => { const u = byId.get(id); return { id, name: u?.name || 'Former member', part: u?.part || '' }; };
  // Who may be put forward: active, not Old Members, not on the Electoral Committee (it runs the election)
  const pool = list.filter((u) => u.status === 'active' && !u.roles.includes('alumni') && !u.roles.includes('electoral'))
    .map(({ id, name, part }) => ({ id, name, part })).sort((a, b) => a.name.localeCompare(b.name));
  const voters = list.filter((u) => u.status === 'active' && !u.roles.includes('alumni')).length;
  return { who, pool, voters };
};

// Vote totals for each office's current round: { office: { candId: n } } and turnout { office: n }
const tally = async (cycle) => {
  const keyOf = new Map(cycle.offices.map((o) => [ballotKey(cycle, o), o.name]));
  const rows = await Ballot.aggregate([{ $match: { electionId: { $in: [...keyOf.keys()] } } }, { $group: { _id: { e: '$electionId', c: '$candId' }, n: { $sum: 1 } } }]);
  const votes = {}; const turnout = {};
  for (const r of rows) {
    const office = keyOf.get(r._id.e);
    (votes[office] ||= {})[r._id.c] = r.n;
    turnout[office] = (turnout[office] || 0) + r.n;
  }
  return { votes, turnout };
};
const results = (o, votes, who) => o.candidateIds.map((id) => ({ ...who(id), votes: votes[o.name]?.[id] || 0 })).sort((a, b) => b.votes - a.votes);
const tiedLeaders = (res) => { const max = res[0]?.votes || 0; const top = res.filter((r) => r.votes === max); return max > 0 && top.length > 1 ? top : []; };
const pastRounds = (o, who) => (o.rounds || []).map((r) => ({ round: r.round, turnout: r.turnout, results: r.results.map((x) => ({ ...who(x.id), votes: x.votes })) }));

// The current election as this member may see it
const view = async (cycle, user, dir) => {
  const p = perms(user.roles);
  const { stage } = cycle;
  const { who } = dir || await directory();
  const showResults = stage === 'published' || (p.oversee && ['live', 'closed'].includes(stage));
  const [{ votes, turnout }, mine] = await Promise.all([
    VOTING.includes(stage) ? tally(cycle) : { votes: {}, turnout: {} },
    VOTING.includes(stage) ? Ballot.find({ userId: user.id, electionId: { $in: cycle.offices.map((o) => ballotKey(cycle, o)) } }, { electionId: 1, candId: 1 }).lean() : [],
  ]);

  const offices = cycle.offices.map((o) => {
    const out = { name: o.name, round: o.round || 1, settled: !!o.settled };
    if (p.oversee || stage === 'nominations') out.eligible = o.eligibleIds.map(who);
    if (p.oversee || ['ballot', 'live', 'closed', 'published'].includes(stage)) out.candidates = o.candidateIds.map(who);
    if (p.oversee) {
      const byNominee = cycle.nominations.filter((n) => n.office === o.name).reduce((m, n) => { (m[n.nomineeId] ||= []).push(n.byId); return m; }, {});
      out.nominations = Object.entries(byNominee).map(([id, by]) => ({
        ...who(id), count: by.length,
        // Only the committee (and admins) see who nominated whom
        ...(p.committee ? { by: by.map((b) => who(b).name).sort() } : {}),
      })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }
    if (VOTING.includes(stage)) out.turnout = turnout[o.name] || 0;
    if (showResults) {
      out.results = results(o, votes, who);
      out.tie = stage !== 'live' && !o.settled && tiedLeaders(out.results).length > 0;
      out.rounds = pastRounds(o, who);
    }
    const myBallot = mine.find((b) => b.electionId === ballotKey(cycle, o));
    if (myBallot) out.myVote = myBallot.candId;
    const myNom = cycle.nominations.find((n) => n.office === o.name && n.byId === user.id);
    if (myNom) out.myNomination = myNom.nomineeId;
    return out;
  });
  return {
    id: String(cycle._id), title: cycle.title, mock: !!cycle.mock, stage, stageLabel: label(cycle), offices,
    skippedNominations: !!cycle.skippedNominations, runoff: cycle.runoff || 0,
    nominators: p.oversee ? new Set(cycle.nominations.map((n) => n.byId)).size : undefined,
    history: (cycle.history || []).map((h) => ({ stage: h.stage, label: h.note || STAGE_LABEL[h.stage], at: h.at, by: h.byName })),
  };
};

// GET /api/elections/current — everything the page needs, in as few database trips as possible
exports.current = async (req, res) => {
  const p = perms(req.user.roles);
  const [cycle, dir] = await Promise.all([Cycle.findOne(ACTIVE).sort({ createdAt: -1 }), directory()]);
  const visible = cycle && (cycle.stage !== 'setup' || p.oversee);
  res.json({
    perms: p,
    cycle: visible ? await view(cycle, req.user, dir) : null,
    preparing: !!cycle && !visible ? (cycle.mock ? 'practice' : 'real') : null,
    pool: p.committee && cycle && ['setup', 'nominations'].includes(cycle.stage) ? dir.pool : [],
    logCount: p.admin ? await electionLogCount() : undefined,
    voters: dir.voters,
  });
};

// GET /api/elections/past — published results from earlier elections (asked for only when that tab opens)
exports.past = async (req, res) => {
  const [cycles, polls, { who }] = await Promise.all([
    Cycle.find({ stage: 'archived', mock: { $ne: true } }).sort({ updatedAt: -1 }).limit(10),
    Election.find({ status: 'closed' }).lean(),
    directory(),
  ]);
  const tallies = await Promise.all(cycles.map(tally));
  const out = cycles.map((c, i) => {
    const done = (c.history || []).find((h) => h.stage === 'published');
    return {
      id: String(c._id), title: c.title, date: done?.at || c.updatedAt,
      offices: c.offices.map((o) => ({ name: o.name, turnout: tallies[i].turnout[o.name] || 0, results: results(o, tallies[i].votes, who), rounds: pastRounds(o, who) })),
    };
  });
  // Polls from the older one-office-at-a-time system
  if (polls.length) {
    out.push({
      id: 'earlier', title: 'Earlier polls', date: null,
      offices: polls.map((e) => {
        const v = e.votes instanceof Map ? Object.fromEntries(e.votes) : (e.votes || {});
        return { pollId: e.uid, name: e.post, turnout: Object.values(v).reduce((a, b) => a + b, 0), results: (e.candidateIds || []).map((id) => ({ ...who(id), votes: v[id] || 0 })).sort((a, b) => b.votes - a.votes) };
      }),
    });
  }
  res.json(out);
};

// Small helpers for the writes below
const actorName = async (req) => (await roster()).find((u) => u.id === req.user.id)?.name || 'Someone';
const load = async (res) => {
  const cycle = await Cycle.findOne(ACTIVE).sort({ createdAt: -1 });
  if (!cycle) res.status(404).json({ msg: 'There is no election in progress' });
  return cycle;
};
const announce = async (cycle, key, text) => {
  const uid = `elec-${cycle._id}-${key}`;
  await Notification.updateOne({ uid }, { $setOnInsert: { uid, text: cycle.mock ? `Practice election — ${text}` : text, date: today(), readBy: [] } }, { upsert: true });
};
const log = (req, cycle, detail) => security.recordAction(req, 'election', { id: req.user.id, name: 'Elections' }, `${cycle?.mock ? '[Practice] ' : ''}${detail}`);
const reply = async (req, res, cycle) => res.json({ ok: true, cycle: await view(cycle, req.user) });
const removeBallots = (cycle) => Ballot.deleteMany({ electionId: { $regex: `^${cycle._id}:` } });

// POST /api/elections/cycles { title, mock } — a new election (the last one's results move to history;
// a finished practice election is simply removed)
exports.create = async (req, res) => {
  if (!perms(req.user.roles).committee) return res.status(403).json({ msg: 'Only the Electoral Committee or an admin can start an election' });
  const mock = req.body?.mock === true;
  const title = mock ? 'Practice election' : (String(req.body?.title || '').trim().slice(0, 80) || `${new Date().getFullYear()} Executive Elections`);
  const open = await Cycle.findOne(ACTIVE);
  if (open && open.stage !== 'published') return res.status(409).json({ msg: open.mock ? 'End the practice election first' : 'Finish or cancel the current election first' });
  const name = await actorName(req);
  if (open && open.mock) { await removeBallots(open); await Cycle.deleteOne({ _id: open._id }); }
  else if (open) { open.stage = 'archived'; open.history.push({ stage: 'archived', at: new Date(), byId: req.user.id, byName: name }); await open.save(); }
  const cycle = await Cycle.create({ title, mock, createdById: req.user.id, history: [{ stage: 'setup', at: new Date(), byId: req.user.id, byName: name }] });
  await log(req, cycle, `Started "${title}"`);
  reply(req, res, cycle);
};

// PUT /api/elections/current/offices { offices: [{ name, eligibleIds }] } — before and while nominations are open
exports.offices = async (req, res) => {
  if (!perms(req.user.roles).committee) return res.status(403).json({ msg: 'Only the Electoral Committee or an admin can set the offices' });
  const [cycle, dir] = await Promise.all([load(res), directory()]);
  if (!cycle) return;
  if (!['setup', 'nominations'].includes(cycle.stage)) return res.status(400).json({ msg: 'Offices are fixed once the candidates are being chosen' });
  const allowed = new Set(dir.pool.map((m) => m.id));
  const seen = new Set(); const offices = [];
  for (const o of (Array.isArray(req.body?.offices) ? req.body.offices : []).slice(0, MAX_OFFICES)) {
    const name = String(o?.name || '').trim().slice(0, 60);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    // Anyone who has since left, become an Old Member or joined the committee drops off quietly
    const eligibleIds = [...new Set((o.eligibleIds || []).map(String))].filter((id) => allowed.has(id));
    const before = cycle.offices.find((x) => x.name === name);
    offices.push({ name, eligibleIds, candidateIds: (before?.candidateIds || []).filter((id) => eligibleIds.includes(id)) });
  }
  cycle.offices = offices;
  // Nominations for an office or member that is no longer on the list fall away
  cycle.nominations = cycle.nominations.filter((n) => offices.some((o) => o.name === n.office && o.eligibleIds.includes(n.nomineeId)));
  await cycle.save();
  log(req, cycle, `Offices and eligibility updated: ${offices.map((o) => `${o.name} (${o.eligibleIds.length})`).join(', ') || 'none'}`).catch(() => {});
  res.json({ ok: true, cycle: await view(cycle, req.user, dir) });
};

// PUT /api/elections/current/candidates { office, candidateIds } — while the committee chooses the candidates
exports.candidates = async (req, res) => {
  if (!perms(req.user.roles).committee) return res.status(403).json({ msg: 'Only the Electoral Committee or an admin can choose the candidates' });
  const cycle = await load(res); if (!cycle) return;
  if (cycle.stage !== 'review') return res.status(400).json({ msg: 'Close nominations (or skip them) before choosing the candidates' });
  const office = cycle.offices.find((o) => o.name === req.body?.office);
  if (!office) return res.status(404).json({ msg: 'Office not found' });
  const ids = [...new Set((req.body?.candidateIds || []).map(String))];
  if (!ids.every((id) => office.eligibleIds.includes(id))) return res.status(400).json({ msg: 'Candidates must be eligible for this office' });
  office.candidateIds = ids;
  await cycle.save();
  reply(req, res, cycle);
};

// POST /api/elections/current/stage { to } — each step of the election, with who may take it
const MOVES = {
  'setup>nominations': COMMITTEE, 'nominations>setup': COMMITTEE,
  'setup>review': COMMITTEE, // skip nominations: the committee picks the candidates from the eligible members
  'review>setup': COMMITTEE,
  'nominations>review': COMMITTEE, 'review>nominations': COMMITTEE,
  'review>ballot': COMMITTEE, 'ballot>review': COMMITTEE,
  'ballot>live': OVERSEE, 'live>closed': OVERSEE, 'closed>published': OVERSEE,
};
exports.stage = async (req, res) => {
  const cycle = await load(res); if (!cycle) return;
  const from = cycle.stage; const to = String(req.body?.to || '');
  const who = MOVES[`${from}>${to}`];
  if (!who) return res.status(400).json({ msg: `The election can't go from "${STAGE_LABEL[from]}" to "${STAGE_LABEL[to] || to}"` });
  if (!has(req.user.roles, who)) return res.status(403).json({ msg: who === COMMITTEE ? 'Only the Electoral Committee or an admin can do this' : 'Only the Electoral Committee, President or admin can do this' });
  if (cycle.runoff && ['review', 'setup', 'nominations'].includes(to)) return res.status(400).json({ msg: 'A run-off uses the tied candidates — it cannot go back to nominations or candidates' });
  const set = { stage: to };
  let note;
  if (from === 'setup' && (to === 'nominations' || to === 'review')) {
    if (!cycle.offices.length) return res.status(400).json({ msg: 'Choose at least one office first' });
    const thin = cycle.offices.filter((o) => o.eligibleIds.length < 2).map((o) => o.name);
    if (thin.length) return res.status(400).json({ msg: `Each office needs at least 2 eligible members: ${thin.join(', ')}` });
    set.skippedNominations = to === 'review';
    if (to === 'review') note = 'Nominations skipped — committee choosing the candidates';
  }
  if (from === 'review' && to === 'nominations') set.skippedNominations = false;
  if (to === 'review' && from === 'nominations') {
    // Start the candidate list from everyone who was nominated; the committee can change it
    for (const o of cycle.offices) if (!o.candidateIds.length) o.candidateIds = [...new Set(cycle.nominations.filter((n) => n.office === o.name).map((n) => n.nomineeId))];
    set.offices = cycle.offices;
  }
  if (to === 'ballot') {
    const thin = cycle.offices.filter((o) => o.candidateIds.length < 2).map((o) => o.name);
    if (thin.length) return res.status(400).json({ msg: `Each office needs at least 2 candidates: ${thin.join(', ')}` });
  }
  // Only one person's click counts if two press at once
  const name = await actorName(req);
  const updated = await Cycle.findOneAndUpdate(
    { _id: cycle._id, stage: from },
    { $set: set, $push: { history: { stage: to, note, at: new Date(), byId: req.user.id, byName: name } } },
    { new: true },
  );
  if (!updated) return res.status(409).json({ msg: 'Someone else just changed the election — refresh to see it' });
  const t = updated.title; const r = updated.runoff ? `-r${updated.runoff}` : '';
  if (to === 'nominations' && from === 'setup') await announce(updated, 'nominations', `🗳️ ${t}: nominations are open — nominate members for ${updated.offices.length} office${updated.offices.length === 1 ? '' : 's'} on the Elections page.`);
  if (to === 'ballot' && !updated.runoff) await announce(updated, 'ballot', `🗳️ ${t}: the candidates are published. Voting opens soon.`);
  if (to === 'live') await announce(updated, `live${r}`, updated.runoff ? `🗳️ ${t}: the run-off vote is LIVE — vote again on the Elections page!` : `🗳️ ${t}: voting is LIVE — cast your vote on the Elections page!`);
  if (to === 'published') await announce(updated, 'published', `🏆 ${t}: the results are published.`);
  log(req, updated, `${t}: ${STAGE_LABEL[from]} → ${note || STAGE_LABEL[to]}`).catch(() => {});
  reply(req, res, updated);
};

// POST /api/elections/current/runoff — after voting closes, every tied office votes again between its tied leaders
exports.runoff = async (req, res) => {
  if (!perms(req.user.roles).oversee) return res.status(403).json({ msg: 'Only the Electoral Committee, President or admin can call a run-off' });
  const cycle = await load(res); if (!cycle) return;
  if (cycle.stage !== 'closed') return res.status(400).json({ msg: 'Close voting first — a run-off follows the count' });
  const [{ votes, turnout }, { who }] = await Promise.all([tally(cycle), directory()]);
  const round = Math.max(...cycle.offices.map((o) => o.round || 1)) + 1;
  const tied = [];
  for (const o of cycle.offices) {
    if (o.settled) continue;
    const res1 = results(o, votes, who);
    const top = tiedLeaders(res1);
    if (!top.length) { o.settled = true; continue; }
    o.rounds.push({ round: o.round || 1, turnout: turnout[o.name] || 0, results: res1.map((x) => ({ id: x.id, votes: x.votes })) });
    o.candidateIds = top.map((x) => x.id);
    o.round = round;
    tied.push(`${o.name} (${top.map((x) => x.name).join(' v ')})`);
  }
  if (!tied.length) return res.status(400).json({ msg: 'No office is tied — publish the results' });
  const name = await actorName(req);
  const updated = await Cycle.findOneAndUpdate(
    { _id: cycle._id, stage: 'closed' },
    { $set: { stage: 'ballot', runoff: round, offices: cycle.offices }, $push: { history: { stage: 'ballot', note: `Run-off called: ${tied.join(', ')}`, at: new Date(), byId: req.user.id, byName: name } } },
    { new: true },
  );
  if (!updated) return res.status(409).json({ msg: 'Someone else just changed the election — refresh to see it' });
  await announce(updated, `runoff-r${round}`, `⚖️ ${updated.title}: a tie means a run-off vote for ${tied.join(', ')}. Voting opens soon.`);
  log(req, updated, `Run-off called (round ${round}): ${tied.join(', ')}`).catch(() => {});
  reply(req, res, updated);
};

// DELETE /api/elections/current — cancel an election before voting starts (a practice one at any time)
exports.cancel = async (req, res) => {
  if (!perms(req.user.roles).committee) return res.status(403).json({ msg: 'Only the Electoral Committee or an admin can cancel an election' });
  const cycle = await load(res); if (!cycle) return;
  if (!cycle.mock && !['setup', 'nominations', 'review', 'ballot'].includes(cycle.stage)) return res.status(400).json({ msg: 'Voting has started — this election can no longer be cancelled' });
  await Cycle.deleteOne({ _id: cycle._id });
  await removeBallots(cycle);
  await log(req, cycle, `${cycle.mock ? 'Ended' : 'Cancelled'} "${cycle.title}" (${STAGE_LABEL[cycle.stage]})`);
  res.json({ ok: true });
};

// POST /api/elections/current/nominations { office, nomineeId } — one nomination per member per office;
// choosing again replaces it, nomineeId null withdraws it
exports.nominate = async (req, res) => {
  if (!perms(req.user.roles).vote) return res.status(403).json({ msg: 'Old Members can follow elections but not nominate' });
  const cycle = await load(res); if (!cycle) return;
  if (cycle.stage !== 'nominations') return res.status(400).json({ msg: 'Nominations are not open' });
  const office = cycle.offices.find((o) => o.name === req.body?.office);
  if (!office) return res.status(404).json({ msg: 'Office not found' });
  const nomineeId = req.body?.nomineeId ? String(req.body.nomineeId) : null;
  if (nomineeId === req.user.id) return res.status(400).json({ msg: "You can't nominate yourself" });
  if (nomineeId && !office.eligibleIds.includes(nomineeId)) return res.status(400).json({ msg: 'That member is not eligible for this office' });
  // Drop this member's old choice, then add the new one — safe when others nominate at the same moment
  const pulled = await Cycle.findOneAndUpdate(
    { _id: cycle._id, stage: 'nominations' },
    { $pull: { nominations: { office: office.name, byId: req.user.id } } },
    { new: true },
  );
  if (!pulled) return res.status(409).json({ msg: 'Nominations have just closed' });
  const updated = nomineeId
    ? await Cycle.findOneAndUpdate({ _id: cycle._id, stage: 'nominations' }, { $push: { nominations: { office: office.name, nomineeId, byId: req.user.id, at: new Date() } } }, { new: true })
    : pulled;
  if (!updated) return res.status(409).json({ msg: 'Nominations have just closed' });
  reply(req, res, updated);
};

// POST /api/elections/current/vote { office, candId } — one secret ballot per member per office and round
exports.vote = async (req, res) => {
  if (!perms(req.user.roles).vote) return res.status(403).json({ msg: 'Old Members can follow elections but not vote' });
  const cycle = await load(res); if (!cycle) return;
  if (cycle.stage !== 'live') return res.status(400).json({ msg: 'Voting is not open' });
  const office = cycle.offices.find((o) => o.name === req.body?.office);
  if (!office) return res.status(404).json({ msg: 'Office not found' });
  if (office.settled) return res.status(400).json({ msg: `${office.name} was decided in the earlier round — only tied offices vote in the run-off` });
  if (!office.candidateIds.includes(String(req.body?.candId))) return res.status(400).json({ msg: 'Unknown candidate' });
  try {
    await Ballot.create({ electionId: ballotKey(cycle, office), userId: req.user.id, candId: String(req.body.candId) });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ msg: `You have already voted for ${office.name}` });
    throw e;
  }
  reply(req, res, cycle);
};

/* ---------------- Admin tools: undo a step, delete an election, delete election logs ---------------- */
// Election log entries: the server's Security log ("election" actions) and the choir's Audit Log entries about elections
const AUDIT_ACTIONS = ['ELECTION', 'VOTE', 'NOM_SUGGEST'];
const electionLogCount = async () => (await SecurityEvent.countDocuments({ type: 'election' })) + (await AuditLog.countDocuments({ action: { $in: AUDIT_ACTIONS } }));
const adminOnly = (req, res) => { if (perms(req.user.roles).admin) return true; res.status(403).json({ msg: 'Only an admin can do this' }); return false; };
// The deletion itself is always recorded (a separate type, so deleting election logs never removes it)
const logAdmin = (req, detail) => security.recordAction(req, 'election_admin', { id: req.user.id, name: 'Elections' }, detail, true);
const dropNotices = async (cycleId, keep = () => false) => {
  const notes = await Notification.find({ uid: { $regex: `^elec-${cycleId}-` } }, { uid: 1 }).lean();
  const ids = notes.map((n) => n.uid).filter((u) => !keep(u));
  if (!ids.length) return;
  await Notification.deleteMany({ uid: { $in: ids } });
  await tombstones.add('notifs', ids);
};

// POST /api/elections/current/revert { to } — go back to an earlier step. Going back before the ballot
// (to change offices, nominations or candidates) clears the votes, because the candidates may change.
const ORDER = ['setup', 'nominations', 'review', 'ballot', 'live', 'closed', 'published'];
exports.revert = async (req, res) => {
  if (!adminOnly(req, res)) return;
  const cycle = await load(res); if (!cycle) return;
  const from = cycle.stage; const to = String(req.body?.to || '');
  if (!ORDER.includes(to) || ORDER.indexOf(to) >= ORDER.indexOf(from)) return res.status(400).json({ msg: 'Choose an earlier step' });
  if (cycle.runoff && ORDER.indexOf(to) < ORDER.indexOf('ballot')) return res.status(400).json({ msg: 'This election had a run-off: it can go back to the run-off ballot at the earliest' });
  let cleared = 0;
  if (ORDER.indexOf(to) < ORDER.indexOf('ballot')) cleared = (await removeBallots(cycle)).deletedCount || 0;
  const name = await actorName(req);
  const updated = await Cycle.findOneAndUpdate(
    { _id: cycle._id, stage: from },
    { $set: { stage: to }, $push: { history: { stage: to, note: `Admin went back to "${STAGE_LABEL[to]}"${cleared ? ` (${cleared} votes cleared)` : ''}`, at: new Date(), byId: req.user.id, byName: name } } },
    { new: true },
  );
  if (!updated) return res.status(409).json({ msg: 'Someone else just changed the election — refresh to see it' });
  // Notices for steps that are now undone are taken back
  const undone = ['nominations', 'ballot', 'live', 'published'].filter((st) => ORDER.indexOf(st) > ORDER.indexOf(to));
  await dropNotices(cycle._id, (uid) => !undone.some((st) => uid === `elec-${cycle._id}-${st}` || uid.startsWith(`elec-${cycle._id}-${st}-`)));
  await logAdmin(req, `${updated.title}: went back from "${STAGE_LABEL[from]}" to "${STAGE_LABEL[to]}"${cleared ? `, ${cleared} votes cleared` : ''}`);
  reply(req, res, updated);
};

// DELETE /api/elections/cycles/:id?logs=1 — remove an election (current or past) with its votes and notices,
// and optionally the log entries about it
exports.remove = async (req, res) => {
  if (!adminOnly(req, res)) return;
  const cycle = await Cycle.findById(String(req.params.id)).catch(() => null);
  if (!cycle) return res.status(404).json({ msg: 'Election not found' });
  const votes = (await removeBallots(cycle)).deletedCount || 0;
  await dropNotices(cycle._id);
  let logs = 0;
  if (req.query.logs === '1') {
    const since = new Date(cycle.createdAt.getTime() - 60000);
    const ev = await SecurityEvent.find({ type: 'election', createdAt: { $gte: since }, detail: { $regex: cycle.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') } }, { _id: 1 }).lean();
    logs = (await SecurityEvent.deleteMany({ _id: { $in: ev.map((e) => e._id) } })).deletedCount || 0;
  }
  await Cycle.deleteOne({ _id: cycle._id });
  await logAdmin(req, `Deleted the election "${cycle.title}" (${STAGE_LABEL[cycle.stage]}): ${votes} votes${logs ? `, ${logs} log entries` : ''}`);
  res.json({ ok: true, votes, logs });
};

// DELETE /api/elections/polls/:id — remove a poll from the older one-office system (shown under "Earlier polls")
exports.removePoll = async (req, res) => {
  if (!adminOnly(req, res)) return;
  const poll = await Election.findOne({ uid: String(req.params.id) }).lean();
  if (!poll) return res.status(404).json({ msg: 'Poll not found' });
  await Ballot.deleteMany({ electionId: poll.uid });
  await Election.deleteOne({ uid: poll.uid });
  await logAdmin(req, `Deleted the earlier poll for ${poll.post}`);
  res.json({ ok: true });
};

// DELETE /api/elections/logs — every election log entry (Security log "election" actions and Audit Log election entries)
exports.removeLogs = async (req, res) => {
  if (!adminOnly(req, res)) return;
  const audit = await AuditLog.find({ action: { $in: AUDIT_ACTIONS } }, { uid: 1 }).lean();
  const a = (await AuditLog.deleteMany({ uid: { $in: audit.map((x) => x.uid) } })).deletedCount || 0;
  await tombstones.add('audit', audit.map((x) => x.uid));
  const s = (await SecurityEvent.deleteMany({ type: 'election' })).deletedCount || 0;
  await logAdmin(req, `Deleted ${a + s} election log entries`);
  res.json({ ok: true, deleted: a + s });
};

// Status for the menu badge and dashboard
exports.status = async (userRoles) => {
  const cycle = await Cycle.findOne(ACTIVE, { stage: 1, title: 1, mock: 1, runoff: 1 }).sort({ createdAt: -1 }).lean();
  if (!cycle || (cycle.stage === 'setup' && !has(userRoles, OVERSEE))) return null;
  return { stage: cycle.stage, title: cycle.title, label: label(cycle), mock: !!cycle.mock };
};
