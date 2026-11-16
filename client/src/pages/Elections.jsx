import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { TODAY, uid, fmtDate, POSTS, lookalikes, lastSignIn, lastUsed } from '../utils/helpers';
import Icon from '../components/ui/Icon';
import Avatar from '../components/ui/Avatar';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import api from '../services/api';

// The election, step by step. The server decides who may do what; this page shows each role its part.
// Selections show at once on screen and are saved in the background, in order.
const STEPS = [
  ['setup', 'Offices'], ['nominations', 'Nominations'], ['review', 'Candidates'], ['ballot', 'Ballot'],
  ['live', 'Voting'], ['closed', 'Counting'], ['published', 'Results'],
];
const stepIndex = (s) => STEPS.findIndex(([k]) => k === s);
const FAST = ['nominations', 'ballot', 'live', 'closed'];
const errMsg = (e) => e.response?.data?.msg || 'That did not work — please try again';
const yearNow = new Date().getFullYear();
const TITLES = [`${yearNow} Executive Elections`, `${yearNow} By-election`, `${yearNow + 1} Executive Elections`];

export default function ElectionsPage({ ctx }) {
  const { me, users = [], members = [], toast, log, setUsers, setRoleHistory, notify, setElectionStatus } = ctx;
  const [state, setState] = useState(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState('current');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [past, setPast] = useState(null);
  const pending = useRef(0); // saves still on their way: refreshes wait so they don't undo what you just picked
  const edits = useRef(0); // bumps on every change, so an older refresh never overwrites a newer choice
  const queue = useRef(Promise.resolve());

  const publishStatus = (cycle) => setElectionStatus?.(cycle ? { stage: cycle.stage, title: cycle.title, label: cycle.stageLabel, mock: cycle.mock } : null);
  const load = useCallback(() => {
    const at = edits.current;
    return api.get('/elections/current')
      .then(({ data }) => { if (pending.current || at !== edits.current) return; setState(data); setFailed(false); publishStatus(data.cycle); })
      .catch(() => setFailed(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  // Leaving the page while a pick is still being saved asks first, so nothing is lost
  useEffect(() => {
    const stay = (e) => { if (pending.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', stay);
    return () => window.removeEventListener('beforeunload', stay);
  }, []);

  // Live: results, turnout, nominations and stage changes refresh on their own
  const stage = state?.cycle?.stage;
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load(); }, FAST.includes(stage) ? 4000 : 15000);
    return () => clearInterval(t);
  }, [stage, load]);
  useEffect(() => { if (tab === 'past' && !past) api.get('/elections/past').then(({ data }) => setPast(data)).catch(() => setPast([])); }, [tab, past]);

  // Show the change straight away, save it in the background (one at a time, in order), keep the server's answer
  const apply = (change) => setState((s) => (s?.cycle ? { ...s, cycle: change(s.cycle) } : s));
  const save = (optimistic, fn, done) => {
    edits.current += 1;
    pending.current += 1;
    if (optimistic) apply(optimistic);
    const mine = edits.current;
    const run = queue.current.then(fn).then(({ data }) => {
      if (done) toast(done);
      if (data?.cycle && mine === edits.current) { setState((s) => ({ ...s, cycle: data.cycle })); publishStatus(data.cycle); }
      return true;
    }).catch((e) => { toast(errMsg(e), 'err'); return false; })
      .finally(() => { pending.current -= 1; if (!pending.current && mine !== edits.current) load(); });
    queue.current = run;
    return run.then((ok) => { if (!ok) { edits.current += 1; load(); } return ok; });
  };
  // Big steps (publish, go live…) wait for the server and refresh everything
  const act = async (fn, done) => {
    setBusy(true);
    try {
      await queue.current;
      const { data } = await fn();
      if (done) toast(done);
      edits.current += 1;
      if (data && 'cycle' in data) { setState((s) => ({ ...s, cycle: data.cycle })); publishStatus(data.cycle); }
      load();
      return true;
    } catch (e) { toast(errMsg(e), 'err'); load(); return false; } finally { setBusy(false); }
  };

  if (failed && !state) return <EmptyState icon="vote" text="The elections could not be loaded. Check your connection and refresh." />;
  if (!state) return <div className="card"><p className="muted small">Loading elections…</p></div>;

  const { perms, cycle, pool, voters } = state;
  const committee = users.filter((u) => (u.status || 'active') === 'active' && u.roles.includes('electoral'));

  const move = (to, done) => act(() => api.post('/elections/current/stage', { to }), done).then((ok) => { if (ok) log('ELECTION', done); setConfirm(null); });
  const runoff = () => act(() => api.post('/elections/current/runoff'), 'Run-off called — press Go live when members are ready').then((ok) => { if (ok) log('ELECTION', 'Run-off called'); setConfirm(null); });
  const saveOffices = (offices, done) => save((c) => ({ ...c, offices }), () => api.put('/elections/current/offices', { offices: offices.map((o) => ({ name: o.name, eligibleIds: o.eligible.map((m) => m.id) })) }), done);
  const setCandidates = (office, ids) => save((c) => ({ ...c, offices: c.offices.map((o) => (o.name === office ? { ...o, candidates: ids.map((id) => o.eligible.find((m) => m.id === id) || { id, name: '…' }) } : o)) }),
    () => api.put('/elections/current/candidates', { office, candidateIds: ids }));
  const nominate = (office, nomineeId) => save((c) => ({ ...c, offices: c.offices.map((o) => (o.name === office ? { ...o, myNomination: nomineeId || undefined } : o)) }),
    () => api.post('/elections/current/nominations', { office, nomineeId }), nomineeId ? 'Nomination saved' : 'Nomination withdrawn');
  const vote = (office, candId) => save((c) => ({ ...c, offices: c.offices.map((o) => (o.name === office ? { ...o, myVote: candId, turnout: (o.turnout || 0) + 1 } : o)) }),
    () => api.post('/elections/current/vote', { office, candId }), 'Your vote has been cast 🗳️');

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Elections</h2>
          <p className="muted small">{perms.committee ? 'Run the election: offices and eligibility, nominations, candidates, voting and results.'
            : perms.oversee ? 'Follow the election, take it live, and publish the results with the Electoral Committee.'
              : 'Nominate members, vote when the ballot is live, and see the published results.'}</p>
        </div>
      </div>
      <div className="chip-row el-tabs">
        <button className={`chip lg ${tab === 'current' ? 'on' : ''}`} onClick={() => setTab('current')}>Current</button>
        <button className={`chip lg ${tab === 'committee' ? 'on' : ''}`} onClick={() => setTab('committee')}>Committee</button>
        {perms.oversee && <button className={`chip lg ${tab === 'guide' ? 'on' : ''}`} onClick={() => setTab('guide')}>Guide</button>}
        <button className={`chip lg ${tab === 'past' ? 'on' : ''}`} onClick={() => setTab('past')}>History</button>
      </div>

      {tab === 'current' && (!cycle
        ? (perms.committee
          ? <StartCard busy={busy} openGuide={() => setTab('guide')} onStart={(title, mock) => act(() => api.post('/elections/cycles', { title, mock }), mock ? 'Practice election started — set it up like a real one' : 'Election started — now choose the offices')} />
          : <EmptyState icon="vote" text={state.preparing === 'practice' ? 'The Electoral Committee is preparing a practice election.' : state.preparing ? 'The Electoral Committee is preparing the next election.' : 'There is no election in progress.'} />)
        : (
          <>
            {cycle.mock && <div className="el-mock"><Icon name="shield" size={15} /><span><b>Practice election</b> — for learning only. Nothing here counts or is kept.</span></div>}
            <div className="card el-head">
              <div className="el-head-top">
                <div><h3>{cycle.title}</h3><span className="muted tiny">{cycle.stageLabel}{cycle.history?.length ? ` · since ${fmtDate(String(cycle.history[cycle.history.length - 1].at).slice(0, 10))}` : ''}</span></div>
                <span className={`status-badge ${stage === 'live' ? 'live' : stage === 'published' ? 'closed' : 'draft'}`}>{stage === 'live' && <span className="live-dot" />}{cycle.stageLabel}</span>
              </div>
              <Stepper stage={stage} showSetup={perms.oversee} skipped={cycle.skippedNominations} runoff={cycle.runoff} />
            </div>

            {perms.oversee && (
              <ManagePanel cycle={cycle} perms={perms} pool={pool} busy={busy} voters={voters}
                saveOffices={saveOffices} setCandidates={setCandidates} openGuide={() => setTab('guide')}
                ask={setConfirm} move={move} act={act} runoff={runoff} />
            )}

            {['nominations', 'review'].includes(stage) && !(stage === 'review' && cycle.skippedNominations && perms.oversee) && (
              <NominatePanel cycle={cycle} me={me} canAct={perms.vote} nominate={nominate} />
            )}

            {['ballot', 'live', 'closed'].includes(stage) && (
              <BallotPanel cycle={cycle} canAct={perms.vote} vote={vote} voters={voters} />
            )}

            {stage === 'published' && <ResultsPanel offices={cycle.offices} title={cycle.mock ? 'Practice results' : 'Final results'} />}
            {perms.admin && <AdminTools cycle={cycle} logCount={state.logCount} busy={busy} ask={setConfirm} act={act} log={log} />}
          </>
        ))}
      {tab === 'current' && !cycle && perms.admin && <AdminTools cycle={null} logCount={state.logCount} busy={busy} ask={setConfirm} act={act} log={log} />}

      {tab === 'committee' && (
        <CommitteeTab committee={committee} members={members} users={users} canAppoint={perms.appoint} cycle={cycle}
          appoint={(u) => {
            setUsers((p) => p.map((x) => (x.id === u.id ? { ...x, roles: [...x.roles.filter((y) => y !== 'member'), 'electoral'] } : x)));
            setRoleHistory((p) => [{ id: uid('rh'), userId: u.id, role: 'electoral', granted: TODAY, revoked: null }, ...p]);
            log('ROLE_GRANTED', `Appointed ${u.name} to the Electoral Committee`);
            notify(`${u.name} joined the Electoral Committee`);
            toast(`${u.name} is now on the Electoral Committee`);
          }}
          remove={(u) => {
            setUsers((p) => p.map((x) => (x.id === u.id ? { ...x, roles: x.roles.filter((y) => y !== 'electoral') } : x)));
            setRoleHistory((p) => p.map((h) => (h.userId === u.id && h.role === 'electoral' && !h.revoked ? { ...h, revoked: TODAY } : h)));
            log('ROLE_REVOKED', `Removed ${u.name} from the Electoral Committee`);
            toast(`${u.name} left the Electoral Committee`);
          }} />
      )}

      {tab === 'guide' && perms.oversee && <Guide />}

      {tab === 'past' && (!past ? <div className="card"><p className="muted small">Loading past results…</p></div>
        : past.length ? past.map((p) => (
          <ResultsPanel key={p.id} offices={p.offices} title={p.title} date={p.date}
            onDelete={perms.admin && p.id !== 'earlier' ? () => setConfirm({
              title: 'Delete these results', danger: true, ok: 'Delete', option: 'Also delete the log entries about this election',
              text: `Delete "${p.title}" and all its votes from History? Members will no longer see these results. This can't be undone.`,
              run: (withLogs) => act(() => api.delete(`/elections/cycles/${p.id}${withLogs ? '?logs=1' : ''}`), 'Election deleted').then(() => { setPast(null); setConfirm(null); }),
            }) : null}
            onDeletePoll={perms.admin && p.id === 'earlier' ? (o) => setConfirm({
              title: 'Delete this poll', danger: true, ok: 'Delete',
              text: `Delete the earlier poll for ${o.name} and its votes? This can't be undone.`,
              run: () => act(() => api.delete(`/elections/polls/${o.pollId}`), 'Poll deleted').then(() => { setPast(null); setConfirm(null); }),
            }) : null} />
        ))
          : <EmptyState icon="vote" text="No published results yet." />)}

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title || ''}>
        {confirm && <ConfirmBody confirm={confirm} busy={busy} close={() => setConfirm(null)} />}
      </Modal>
    </div>
  );
}

function ConfirmBody({ confirm, busy, close }) {
  const [opt, setOpt] = useState(false);
  return (<>
    <p className="small">{confirm.text}</p>
    {confirm.option && <label className="el-pick" style={{ marginTop: 8 }}><input type="checkbox" checked={opt} onChange={(e) => setOpt(e.target.checked)} /><span>{confirm.option}</span></label>}
    <div className="modal-foot">
      <button className="btn btn-ghost" onClick={close}>Not now</button>
      <button className={`btn ${confirm.danger ? 'btn-danger-soft' : 'btn-pri'}`} disabled={busy} onClick={() => confirm.run(opt)}>{busy ? 'Working…' : confirm.ok}</button>
    </div>
  </>);
}

/* ---------- Admin only: undo a step, delete the election, delete election logs ---------- */
const STEP_NAMES = { setup: 'Offices (setting up)', nominations: 'Nominations open', review: 'Choosing candidates', ballot: 'Candidates published (voting paused)', live: 'Voting live', closed: 'Voting closed (results hidden)' };
function AdminTools({ cycle, logCount, busy, ask, act, log }) {
  const order = ['setup', 'nominations', 'review', 'ballot', 'live', 'closed', 'published'];
  const at = cycle ? order.indexOf(cycle.stage) : -1;
  const earlier = cycle ? order.slice(cycle.runoff ? order.indexOf('ballot') : 0, at) : [];
  const [to, setTo] = useState('');
  const votes = cycle ? cycle.offices.reduce((a, o) => a + (o.turnout || 0), 0) : 0;
  const back = () => {
    const clears = order.indexOf(to) < order.indexOf('ballot');
    ask({
      title: 'Go back to an earlier step', ok: 'Go back', danger: clears && votes > 0,
      text: `Move "${cycle.title}" back to "${STEP_NAMES[to]}".${clears ? ' Going back before the ballot clears every vote cast so far, because the candidates may change.' : ''}${cycle.stage === 'published' ? ' Members will no longer see the results until they are published again.' : ''} The change is recorded in the Security log.`,
      run: () => act(() => api.post('/elections/current/revert', { to }), `Back to "${STEP_NAMES[to]}"`).then((ok) => { if (ok) log('ELECTION', `Admin moved the election back to ${STEP_NAMES[to]}`); ask(null); setTo(''); }),
    });
  };
  const del = () => ask({
    title: 'Delete this election', danger: true, ok: 'Delete election', option: 'Also delete the log entries about this election',
    text: `Delete "${cycle.title}" completely — offices, nominations, candidates, every vote and its notices. Members will no longer see it. This can't be undone.`,
    run: (withLogs) => act(() => api.delete(`/elections/cycles/${cycle.id}${withLogs ? '?logs=1' : ''}`), 'Election deleted').then(() => ask(null)),
  });
  const delLogs = () => ask({
    title: 'Delete election logs', danger: true, ok: 'Delete logs',
    text: `Delete all ${logCount || 0} election entries from the Security log and the Audit Log (stage changes, votes recorded, nominations). Other logs are not touched, and this deletion itself stays recorded. This can't be undone.`,
    run: () => act(() => api.delete('/elections/logs'), 'Election logs deleted').then(() => ask(null)),
  });
  return (
    <div className="card el-admin">
      <div className="card-h"><h3>Admin tools</h3><span className="chip sm">Admin only</span></div>
      <p className="muted small el-hint">Undo a step or remove election records. Every action here asks first and is recorded in the Security log.</p>
      {cycle && earlier.length > 0 && (
        <div className="el-admin-row">
          <div><b>Go back to an earlier step</b><span className="muted tiny">e.g. hide published results, re-open voting, pause voting</span></div>
          <div className="el-office-add">
            <select className="input sm" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Earlier step">
              <option value="">Choose a step…</option>
              {earlier.slice().reverse().map((st) => <option key={st} value={st}>{STEP_NAMES[st]}</option>)}
            </select>
            <button className="btn btn-sm btn-soft" disabled={!to || busy} onClick={back}>Go back</button>
          </div>
        </div>
      )}
      {cycle && (
        <div className="el-admin-row">
          <div><b>Delete this election</b><span className="muted tiny">{votes ? `${votes} votes, ` : ''}all its offices, nominations and notices</span></div>
          <button className="btn btn-sm btn-danger-soft" disabled={busy} onClick={del}><Icon name="trash" size={12} /> Delete election</button>
        </div>
      )}
      <div className="el-admin-row">
        <div><b>Election logs</b><span className="muted tiny">{logCount || 0} entries in the Security log and Audit Log</span></div>
        <button className="btn btn-sm btn-danger-soft" disabled={busy || !logCount} onClick={delLogs}><Icon name="trash" size={12} /> Delete election logs</button>
      </div>
    </div>
  );
}

/* ---------- Steps across the top ---------- */
function Stepper({ stage, showSetup, skipped, runoff }) {
  const at = stepIndex(stage);
  const steps = (showSetup ? STEPS : STEPS.slice(1)).map(([k, l]) => [k, k === 'nominations' && skipped ? 'Nominations skipped' : k === 'ballot' && runoff ? 'Run-off ballot' : k === 'live' && runoff ? 'Run-off vote' : l]);
  return (
    <ol className="el-steps" aria-label="Election progress">
      {steps.map(([k, text]) => {
        const i = stepIndex(k);
        const skip = k === 'nominations' && skipped;
        return <li key={k} className={skip ? 'skip' : i < at ? 'done' : i === at ? 'now' : ''}><span>{skip ? '–' : i < at ? <Icon name="check" size={11} /> : i + (showSetup ? 1 : 0)}</span>{text}</li>;
      })}
    </ol>
  );
}

/* ---------- No election yet (committee) ---------- */
function StartCard({ busy, onStart, openGuide }) {
  const [title, setTitle] = useState(TITLES[0]);
  return (
    <div className="card el-start">
      <Icon name="vote" size={28} />
      <h3>Start a new election</h3>
      <p className="muted small">You'll choose the offices and who is eligible first. Members see nothing until you publish.</p>
      <div className="el-start-row">
        <select className="input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Election">
          {TITLES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <button className="btn btn-pri" disabled={busy} onClick={() => onStart(title, false)}><Icon name="plus" size={14} /> Start</button>
      </div>
      <div className="el-or"><span>or</span></div>
      <button className="btn btn-soft" disabled={busy} onClick={() => onStart('', true)}><Icon name="shield" size={14} /> Run a practice election</button>
      <p className="muted tiny">A practice run works exactly like the real thing, is clearly marked "Practice", can be ended at any time and is never kept in the results. <button className="link-btn" onClick={openGuide}>Read the election guide</button></p>
    </div>
  );
}

/* ---------- Committee, President and admin controls for each stage ---------- */
function ManagePanel({ cycle, perms, pool, busy, voters, saveOffices, setCandidates, ask, move, act, runoff, openGuide }) {
  const { stage, offices } = cycle;
  const [editing, setEditing] = useState(false);
  const c = perms.committee;
  const conf = (title, text, ok, to, done, danger) => ask({ title, text, ok, danger, run: () => move(to, done) });
  const cancel = () => ask({
    title: cycle.mock ? 'End the practice election' : 'Cancel this election', danger: true, ok: cycle.mock ? 'End practice' : 'Yes, cancel it',
    text: cycle.mock ? 'The practice election and every practice vote are deleted.' : `Cancel "${cycle.title}"? Its offices, eligibility lists and nominations are deleted. This can't be undone.`,
    run: () => act(() => api.delete('/elections/current'), cycle.mock ? 'Practice election ended' : 'Election cancelled').then(() => ask(null)),
  });
  const ties = offices.filter((o) => o.tie);

  const actions = ({
    setup: c && [
      <button key="p" className="btn btn-pri" disabled={busy} onClick={() => conf('Publish for nominations', `Members will see the ${offices.length} office${offices.length === 1 ? '' : 's'} and who is eligible, and can start nominating. You can still adjust eligibility while nominations are open.`, 'Publish', 'nominations', 'Nominations are open — members have been notified')}><Icon name="send" size={14} /> Publish for nominations</button>,
      <button key="s" className="btn btn-soft" disabled={busy} onClick={() => conf('Skip nominations', 'Members will not nominate. You choose the candidates for each office straight from the eligible members, then publish them.', 'Skip to candidates', 'review', 'Nominations skipped — tick the candidates for each office')}>Skip nominations — choose candidates</button>,
    ],
    nominations: c && [
      <button key="c" className="btn btn-pri" disabled={busy} onClick={() => conf('Close nominations', 'Members can no longer nominate. Everyone nominated becomes a suggested candidate for you to confirm.', 'Close nominations', 'review', 'Nominations closed — now confirm the candidates')}><Icon name="check" size={14} /> Close nominations</button>,
      <button key="h" className="btn btn-ghost" disabled={busy} onClick={() => conf('Hide from members', 'Members will no longer see the offices until you publish again. Nominations made so far are kept.', 'Hide', 'setup', 'Hidden from members')}>Hide from members</button>,
    ],
    review: c && [
      <button key="p" className="btn btn-pri" disabled={busy} onClick={() => conf('Publish the candidates', 'Members will see the final candidates for each office. Voting starts only when someone presses Go live.', 'Publish candidates', 'ballot', 'Candidates published')}><Icon name="send" size={14} /> Publish candidates</button>,
      cycle.skippedNominations
        ? <button key="o" className="btn btn-ghost" disabled={busy} onClick={() => move('setup', 'Back to offices')}>Back to offices</button>
        : <button key="r" className="btn btn-ghost" disabled={busy} onClick={() => move('nominations', 'Nominations reopened')}>Reopen nominations</button>,
      cycle.skippedNominations && <button key="n" className="btn btn-ghost" disabled={busy} onClick={() => conf('Open nominations instead', 'Members will be able to nominate after all. The candidates you ticked are kept as suggestions.', 'Open nominations', 'nominations', 'Nominations are open')}>Open nominations instead</button>,
    ],
    ballot: [
      <button key="g" className="btn btn-pri el-go" disabled={busy} onClick={() => conf(cycle.runoff ? 'Go live with the run-off' : 'Go live', `${cycle.runoff ? 'The run-off vote' : 'Voting'} opens now. Members are notified and can each vote once per office. Live results are visible only to the committee, the President and admins.`, 'Go live', 'live', cycle.runoff ? 'Run-off voting is LIVE' : 'Voting is LIVE')}><Icon name="play" size={14} /> Go live</button>,
      c && !cycle.runoff && <button key="b" className="btn btn-ghost" disabled={busy} onClick={() => move('review', 'Back to candidates')}>Back to candidates</button>,
    ],
    live: [<button key="x" className="btn btn-soft" disabled={busy} onClick={() => conf('Close voting', 'No more votes will be accepted. Results stay private until you publish them.', 'Close voting', 'closed', 'Voting closed — check the count')}><Icon name="check" size={14} /> Close voting</button>],
    closed: [
      ties.length > 0 && <button key="t" className="btn btn-pri" disabled={busy} onClick={() => ask({ title: 'Hold a run-off', ok: 'Call the run-off', text: `Members vote again, only between the tied candidates, for: ${ties.map((o) => o.name).join(', ')}. Offices with a clear winner keep their result. You'll press Go live to open the run-off.`, run: runoff })}><Icon name="vote" size={14} /> Hold a run-off for {ties.length === 1 ? ties[0].name : `${ties.length} tied offices`}</button>,
      <button key="p" className={`btn ${ties.length ? 'btn-soft' : 'btn-pri'}`} disabled={busy} onClick={() => conf('Publish the results', `Every member will see the final results.${ties.length ? ' Tied offices will show as a tie.' : ''} This can't be undone.`, 'Publish results', 'published', 'Results published')}><Icon name="send" size={14} /> Publish results{ties.length ? ' as they are' : ''}</button>,
    ],
    published: c && [<StartNew key="n" busy={busy} mock={cycle.mock} start={(title, mock) => act(() => api.post('/elections/cycles', { title, mock }), mock ? 'Practice election started' : 'New election started — the last results moved to Past results')} />],
  }[stage] || []).filter(Boolean);
  const canCancel = c && (cycle.mock || ['setup', 'nominations', 'review', 'ballot'].includes(stage));

  return (
    <div className="card el-manage">
      <div className="card-h"><h3>{c ? 'Committee controls' : 'Oversight'}</h3><span className="chip sm">{c ? 'Electoral Committee' : 'President'}</span></div>
      <QuickGuide cycle={cycle} committee={c} openGuide={openGuide} />
      <p className="muted small el-hint">{HINT[stage](cycle)} <button className="link-btn" onClick={openGuide}>Full guide</button></p>

      {stage === 'setup' && (c ? <OfficesEditor offices={offices} pool={pool} save={saveOffices} canRename /> : <OfficeSummary offices={offices} />)}
      {stage === 'nominations' && (<>
        <NominationTally offices={offices} nominators={cycle.nominators} voters={voters} />
        {c && <button className="btn btn-sm btn-ghost el-self-start" onClick={() => setEditing((v) => !v)}><Icon name="edit" size={12} /> {editing ? 'Done editing' : 'Edit offices & eligibility'}</button>}
        {c && editing && <OfficesEditor offices={offices} pool={pool} save={saveOffices} />}
      </>)}
      {stage === 'review' && <CandidatesEditor offices={offices} readOnly={!c} save={setCandidates} skipped={cycle.skippedNominations} />}
      {stage === 'ballot' && <OfficeSummary offices={offices} candidates />}
      {['live', 'closed'].includes(stage) && <>
        {stage === 'closed' && ties.length > 0 && <div className="voted-note warn"><Icon name="vote" size={14} /> Tie for {ties.map((o) => o.name).join(', ')}. Hold a run-off between the tied candidates, or publish the results as they are.</div>}
        <ResultsPanel offices={offices} live={stage === 'live'} voters={voters} embedded />
      </>}

      {(actions.length > 0 || canCancel) && (
        <div className="el-actions">
          {actions}
          {canCancel && <button className="btn btn-sm btn-danger-soft el-cancel" disabled={busy} onClick={cancel}><Icon name="trash" size={12} /> {cycle.mock ? 'End practice' : 'Cancel election'}</button>}
        </div>
      )}
    </div>
  );
}
const HINT = {
  setup: () => 'Step 1 — choose the offices and who is eligible for each. Members can\'t see any of this until you publish. You can publish for nominations, or skip nominations and choose the candidates yourselves.',
  nominations: () => 'Step 2 — members are nominating. Counts and who nominated whom update live.',
  review: (c) => (c.skippedNominations ? 'Step 3 — nominations were skipped: tick at least 2 candidates for each office from the eligible members.' : 'Step 3 — tick the candidates for each office (at least 2). Everyone nominated is ticked for you; you can add any eligible member.'),
  ballot: (c) => (c.runoff ? 'Run-off — only the tied offices vote again, between the tied candidates. Press Go live when members are ready.' : 'Step 4 — the candidates are published. Press Go live when the choir is ready to vote.'),
  live: () => 'Voting is live. Results update every few seconds and are visible only to the committee, the President and admins.',
  closed: () => 'Voting is closed. Check the count — hold a run-off for any tie, then publish the results to every member.',
  published: (c) => (c.mock ? 'The practice results are published. End the practice when you are done.' : 'The results are published to every member.'),
};

function StartNew({ busy, start, mock }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(TITLES[0]);
  if (!open) return <button className="btn btn-soft" disabled={busy} onClick={() => setOpen(true)}><Icon name="plus" size={14} /> {mock ? 'Start a real election' : 'Start a new election'}</button>;
  return (
    <div className="el-start-row">
      <select className="input sm" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Election">{TITLES.map((t) => <option key={t}>{t}</option>)}</select>
      <button className="btn btn-sm btn-pri" disabled={busy} onClick={() => start(title, false)}>Start</button>
      <button className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}

/* Offices and who is eligible: everything is picked from lists, nothing typed */
const NEW_OFFICE = '__new__';
const cleanName = (v) => v.replace(/\s+/g, ' ').trim().slice(0, 60);
function OfficesEditor({ offices, pool, save, canRename }) {
  const names = offices.map((o) => o.name);
  const taken = (n) => names.some((x) => x.toLowerCase() === n.toLowerCase());
  const free = POSTS.filter((p) => !names.includes(p));
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState(null); // { from, to }
  const renamed = useRef(null); // Enter and leaving the box both finish a rename: only the first one counts
  const set = (name, eligible) => save(offices.map((o) => (o.name === name ? { ...o, eligible } : o)));
  const addNew = () => {
    const name = cleanName(draft);
    if (!name || taken(name)) return;
    save([...offices, { name, eligible: [] }], `${name} added`);
    setDraft(''); setAdding(false);
  };
  const rename = () => {
    if (!renaming || renamed.current === renaming) return;
    renamed.current = renaming;
    const to = cleanName(renaming.to || '');
    if (!to || (to.toLowerCase() !== renaming.from.toLowerCase() && taken(to))) return;
    if (to !== renaming.from) save(offices.map((o) => (o.name === renaming.from ? { ...o, name: to } : o)), `Renamed to ${to}`);
    setRenaming(null);
  };
  return (
    <div className="stack sm-gap">
      <div className="el-add-office">
        <select className="input" value="" onChange={(e) => { const v = e.target.value; if (v === NEW_OFFICE) setAdding(true); else if (v) save([...offices, { name: v, eligible: [] }], `${v} added`); }} aria-label="Add an office">
          <option value="">+ Add an office…</option>
          {free.map((p) => <option key={p}>{p}</option>)}
          <option value={NEW_OFFICE}>＋ New office (type its name)…</option>
        </select>
        {free.length > 0 && <button className="btn btn-sm btn-soft" onClick={() => save([...offices, ...free.map((name) => ({ name, eligible: [] }))], 'All offices added')}>Add all offices</button>}
      </div>
      {adding && (
        <div className="el-new-office">
          <input className="input sm" autoFocus value={draft} maxLength={60} placeholder="Name of the new office, e.g. Welfare Officer" aria-label="Name of the new office"
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addNew(); if (e.key === 'Escape') setAdding(false); }} />
          <button className="btn btn-sm btn-pri" disabled={!cleanName(draft) || taken(cleanName(draft))} onClick={addNew}>Add office</button>
          <button className="btn btn-sm btn-ghost" onClick={() => { setAdding(false); setDraft(''); }}>Cancel</button>
          {cleanName(draft) && taken(cleanName(draft)) && <span className="muted tiny">That office is already on the list.</span>}
        </div>
      )}
      {!offices.length && <p className="muted small">No offices yet — add the offices up for election.</p>}
      <div className="grid g2">
        {offices.map((o) => {
          const ids = o.eligible.map((m) => m.id);
          const left = pool.filter((m) => !ids.includes(m.id));
          return (
            <div className="el-office" key={o.name}>
              <div className="nom-h">
                {renaming?.from === o.name ? (
                  <input className="input sm el-rename" autoFocus value={renaming.to} maxLength={60} aria-label={`New name for ${o.name}`}
                    onChange={(e) => setRenaming({ ...renaming, to: e.target.value })} onBlur={rename}
                    onKeyDown={(e) => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') { renamed.current = renaming; setRenaming(null); } }} />
                ) : <h4>{o.name}</h4>}
                {canRename && renaming?.from !== o.name && <button className="icon-x" title={`Rename ${o.name}`} aria-label={`Rename ${o.name}`} onClick={() => { renamed.current = null; setRenaming({ from: o.name, to: o.name }); }}><Icon name="edit" size={12} /></button>}
                <span className={`chip sm ${o.eligible.length < 2 ? 'warn' : ''}`}>{o.eligible.length} eligible</span>
                <button className="icon-x" title={`Remove ${o.name}`} aria-label={`Remove ${o.name}`} onClick={() => save(offices.filter((x) => x.name !== o.name), `${o.name} removed`)}><Icon name="x" size={13} /></button>
              </div>
              <div className="nom-grid">
                {o.eligible.map((m) => (
                  <button key={m.id} className="nom-chip on" title="Remove" onClick={() => set(o.name, o.eligible.filter((x) => x.id !== m.id))}>
                    <span className="nom-name">{m.name}</span><Icon name="x" size={11} />
                  </button>
                ))}
                {!o.eligible.length && <span className="muted tiny">Nobody eligible yet.</span>}
              </div>
              <div className="el-office-add">
                <select className="input sm" value="" disabled={!left.length} aria-label={`Add an eligible member for ${o.name}`}
                  onChange={(e) => { const m = pool.find((x) => x.id === e.target.value); if (m) set(o.name, [...o.eligible, m]); }}>
                  <option value="">{left.length ? '+ Add eligible member…' : 'Everyone is eligible'}</option>
                  {left.map((m) => <option key={m.id} value={m.id}>{m.name}{m.part ? ` · ${m.part}` : ''}</option>)}
                </select>
                {left.length > 0 && <button className="btn btn-sm btn-ghost" onClick={() => set(o.name, [...o.eligible, ...left])}>All members</button>}
                {o.eligible.length > 0 && <button className="btn btn-sm btn-ghost" onClick={() => set(o.name, [])}>Clear</button>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="muted tiny">Missing an office? Choose "New office" in the list above to add it by name{canRename ? ', or use the pencil to rename one' : ''}. Members on the Electoral Committee and Old Members can't be made eligible. Each office needs at least 2 eligible members.</p>
    </div>
  );
}

function OfficeSummary({ offices, candidates }) {
  return (
    <div className="grid g2">
      {offices.map((o) => {
        const list = (candidates ? o.candidates : o.eligible) || [];
        return (
          <div className="el-office" key={o.name}>
            <div className="nom-h"><h4>{o.name}</h4>{o.settled ? <span className="chip sm ok">Decided</span> : <span className="chip sm">{list.length} {candidates ? 'candidates' : 'eligible'}</span>}</div>
            <div className="nom-grid">{list.map((m) => <span key={m.id} className="nom-chip"><span className="nom-name">{m.name}</span></span>)}{!list.length && <span className="muted tiny">None yet.</span>}</div>
          </div>
        );
      })}
    </div>
  );
}

// Who nominated whom: the committee (and admins) see the names; the President sees the counts
function Nominators({ by }) {
  if (!by?.length) return null;
  return <div className="el-by"><span>Nominated by</span> {by.join(', ')}</div>;
}

function NominationTally({ offices, nominators, voters }) {
  return (
    <div className="stack sm-gap">
      <div className="el-kpis">
        <div><b>{nominators || 0}</b><span>members have nominated</span></div>
        <div><b>{voters ? Math.round(((nominators || 0) / voters) * 100) : 0}%</b><span>of the choir</span></div>
      </div>
      <div className="grid g2">
        {offices.map((o) => (
          <div className="el-office" key={o.name}>
            <div className="nom-h"><h4>{o.name}</h4><span className="chip sm">{(o.nominations || []).reduce((a, n) => a + n.count, 0)} nominations</span></div>
            {(o.nominations || []).length ? (
              <div className="el-tally">{o.nominations.map((n) => <div key={n.id}><div className="el-tally-row"><span>{n.name}</span><b>{n.count}</b></div><Nominators by={n.by} /></div>)}</div>
            ) : <span className="muted tiny">No nominations yet.</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* Choosing the candidates: every eligible member, nominated ones first, ticked to go on the ballot */
function CandidatesEditor({ offices, readOnly, save, skipped }) {
  return (
    <div className="grid g2">
      {offices.map((o) => {
        const chosen = (o.candidates || []).map((m) => m.id);
        const noms = Object.fromEntries((o.nominations || []).map((n) => [n.id, n]));
        const list = [...(o.eligible || [])].sort((a, b) => (noms[b.id]?.count || 0) - (noms[a.id]?.count || 0) || a.name.localeCompare(b.name));
        const toggle = (id) => save(o.name, chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
        return (
          <div className="el-office" key={o.name}>
            <div className="nom-h"><h4>{o.name}</h4><span className={`chip sm ${chosen.length < 2 ? 'warn' : ''}`}>{chosen.length} candidate{chosen.length === 1 ? '' : 's'}</span></div>
            <div className="stack xs-gap">
              {list.map((m) => (
                <label key={m.id} className={`el-pick ${chosen.includes(m.id) ? 'on' : ''}`}>
                  <input type="checkbox" checked={chosen.includes(m.id)} disabled={readOnly} onChange={() => toggle(m.id)} />
                  <span className="el-pick-main"><b>{m.name}</b>{noms[m.id]?.by && <Nominators by={noms[m.id].by} />}</span>
                  {!skipped && <span className="muted tiny">{noms[m.id] ? `${noms[m.id].count} nomination${noms[m.id].count === 1 ? '' : 's'}` : 'not nominated'}</span>}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Members: nominate from a dropdown ---------- */
function NominatePanel({ cycle, me, canAct, nominate }) {
  const open = cycle.stage === 'nominations';
  return (
    <div className="card">
      <div className="card-h"><h3>{open ? 'Make your nominations' : cycle.skippedNominations ? 'Candidates' : 'Your nominations'}</h3><span className="chip sm">{open ? 'Open' : cycle.skippedNominations ? 'Being chosen' : 'Closed'}</span></div>
      <p className="muted small el-hint">{cycle.skippedNominations && !open ? 'The Electoral Committee is choosing the candidates for each office. They will appear here once published.'
        : !canAct ? 'Old Members can follow the election but not nominate.'
          : open ? 'For each office, choose one eligible member. You can change or withdraw your choice until nominations close.'
            : 'Nominations are closed. The Electoral Committee is confirming the candidates.'}</p>
      {!(cycle.skippedNominations && !open) && (
        <div className="grid g2">
          {cycle.offices.map((o) => {
            const options = (o.eligible || []).filter((m) => m.id !== me.id);
            const mine = (o.eligible || []).find((m) => m.id === o.myNomination);
            return (
              <div className="el-office" key={o.name}>
                <div className="nom-h"><h4>{o.name}</h4>{(mine || (o.myNomination && !open)) && <span className="chip sm ok"><Icon name="check" size={11} /> Nominated</span>}</div>
                {open && canAct ? (
                  <div className="el-office-add">
                    <select className="input sm" value={o.myNomination || ''} aria-label={`Nominate for ${o.name}`} onChange={(e) => e.target.value && nominate(o.name, e.target.value)}>
                      <option value="">Choose a nominee…</option>
                      {options.map((m) => <option key={m.id} value={m.id}>{m.name}{m.part ? ` · ${m.part}` : ''}</option>)}
                    </select>
                    {mine && <button className="btn btn-sm btn-ghost" onClick={() => nominate(o.name, null)}>Withdraw</button>}
                  </div>
                ) : <p className="small">{mine ? <>You nominated <b>{mine.name}</b>.</> : o.myNomination ? 'You made a nomination.' : <span className="muted">No nomination from you.</span>}</p>}
                {open && <p className="muted tiny">{(o.eligible || []).length} eligible: {(o.eligible || []).map((m) => m.name).join(', ')}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Members: the ballot ---------- */
function BallotPanel({ cycle, canAct, vote, voters }) {
  const [pick, setPick] = useState({});
  const { stage, runoff } = cycle;
  const open = cycle.offices.filter((o) => !o.settled);
  const decided = cycle.offices.filter((o) => o.settled);
  const done = open.filter((o) => o.myVote).length;
  return (
    <div className="card">
      <div className="card-h">
        <h3>{stage === 'ballot' ? (runoff ? 'Run-off candidates' : 'The candidates') : runoff ? 'Run-off ballot' : 'Your ballot'}</h3>
        {stage === 'live' && <span className="status-badge live"><span className="live-dot" />LIVE</span>}
        {stage === 'closed' && <span className="chip sm">Voting closed</span>}
      </div>
      <p className="muted small el-hint">
        {runoff && stage !== 'closed' ? 'There was a tie. Vote again, only between the tied candidates. ' : ''}
        {stage === 'ballot' ? 'Voting opens when the Electoral Committee goes live. You will be notified.'
          : stage === 'closed' ? 'Voting has closed. The results will appear here once the committee publishes them.'
            : !canAct ? 'Old Members can follow the election but not vote.'
              : `Your ballot is secret — vote once for each office. ${done} of ${open.length} done.`}
      </p>
      <div className="stack">
        {open.map((o) => {
          const voted = (o.candidates || []).find((m) => m.id === o.myVote);
          return (
            <div className="el-ballot" key={o.name}>
              <div className="nom-h"><h4>{o.name}{o.round > 1 && <span className="chip sm warn el-round">Run-off</span>}</h4>{stage !== 'ballot' && <span className="muted tiny">{o.turnout || 0}{voters ? ` of ${voters}` : ''} voted</span>}</div>
              {voted ? <div className="voted-note"><Icon name="check" size={14} /> You voted for <b>{voted.name}</b></div>
                : stage === 'live' && canAct ? (<>
                  <div className="stack sm-gap">
                    {(o.candidates || []).map((m) => (
                      <button key={m.id} className={`cand-row ${pick[o.name] === m.id ? 'sel' : ''}`} onClick={() => setPick((p) => ({ ...p, [o.name]: m.id }))}>
                        <Avatar user={{ name: m.name }} size={32} />
                        <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}><b>{m.name}</b>{m.part && <div className="muted tiny">{m.part}</div>}</div>
                        <span className={`radio ${pick[o.name] === m.id ? 'sel' : ''}`} />
                      </button>
                    ))}
                  </div>
                  <button className="btn btn-pri el-cast" disabled={!pick[o.name]} onClick={() => vote(o.name, pick[o.name])}><Icon name="vote" size={15} /> Cast vote for {o.name}</button>
                </>) : (
                  <div className="nom-grid">{(o.candidates || []).map((m) => <span key={m.id} className="nom-chip"><span className="nom-name">{m.name}</span></span>)}</div>
                )}
            </div>
          );
        })}
        {decided.length > 0 && <p className="muted small">Already decided in the first round: {decided.map((o) => o.name).join(', ')}. Their results are published with the others.</p>}
      </div>
    </div>
  );
}

/* ---------- Results (live for the committee; final for everyone once published) ---------- */
function ResultsPanel({ offices, title, date, live, voters, embedded, onDelete, onDeletePoll }) {
  const body = (
    <div className="grid g2">
      {offices.map((o) => {
        const res = o.results || [];
        const total = res.reduce((a, r) => a + r.votes, 0);
        const max = Math.max(0, ...res.map((r) => r.votes));
        const leaders = res.filter((r) => max > 0 && r.votes === max);
        const tie = leaders.length > 1;
        return (
          <div className="el-office" key={o.name}>
            <div className="nom-h"><h4>{o.name}{o.rounds?.length > 0 && <span className="chip sm el-round">Run-off</span>}</h4><span className="muted tiny">{total} vote{total === 1 ? '' : 's'}{voters ? ` · ${Math.round((total / voters) * 100)}% turnout` : ''}</span>{onDeletePoll && o.pollId && <button className="icon-x" title="Delete this poll" aria-label={`Delete the poll for ${o.name}`} onClick={() => onDeletePoll(o)}><Icon name="trash" size={12} /></button>}</div>
            {!live && tie && <div className="voted-note warn"><Icon name="vote" size={14} /> Tie between {leaders.map((r) => r.name).join(' and ')}{embedded ? '' : ' — the Electoral Committee decides the next step'}.</div>}
            <div className="res-list">
              {res.map((r) => {
                const pct = total ? Math.round((r.votes / total) * 100) : 0;
                const win = !live && !tie && leaders[0]?.id === r.id;
                const lead = live && leaders.some((l) => l.id === r.id);
                return (
                  <div className="res-row" key={r.id}>
                    <span className="res-name">{r.name} {win && <span className="win-tag">🏆 Elected</span>}{lead && <span className="win-tag lead">Leading</span>}</span>
                    <div className="res-track"><motion.div className="res-fill" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} style={{ background: win ? '#059669' : '#d18f26' }} /></div>
                    <span className="res-num">{r.votes} · {pct}%</span>
                  </div>
                );
              })}
            </div>
            {(o.rounds || []).map((r) => (
              <p key={r.round} className="muted tiny el-earlier">Round {r.round} (tied): {r.results.map((x) => `${x.name} ${x.votes}`).join(' · ')}</p>
            ))}
          </div>
        );
      })}
    </div>
  );
  if (embedded) return <div className="stack sm-gap">{live && <p className="el-live-note"><span className="live-dot" /> Live — only the committee, the President and admins see these numbers</p>}{body}</div>;
  return (
    <div className="card">
      <div className="card-h"><h3>{title}</h3><span className="el-res-h">{date && <span className="muted tiny">{fmtDate(String(date).slice(0, 10))}</span>}{onDelete && <button className="btn btn-sm btn-danger-soft" onClick={onDelete}><Icon name="trash" size={12} /> Delete</button>}</span></div>
      {body}
    </div>
  );
}

/* ---------- Who is on the Electoral Committee ---------- */
function CommitteeTab({ committee, members, users = [], canAppoint, appoint, remove, cycle }) {
  const [pick, setPick] = useState('');
  const options = useMemo(() => members.filter((m) => !m.roles.includes('electoral')).sort((a, b) => a.name.localeCompare(b.name)), [members]);
  const running = cycle && !['setup', 'published'].includes(cycle.stage);
  return (
    <div className="card">
      <div className="card-h"><h3>Electoral Committee</h3><span className="chip sm">{committee.length} member{committee.length === 1 ? '' : 's'}</span></div>
      <p className="muted small el-hint">The committee chooses the offices and who is eligible, runs nominations, confirms the candidates, and with the President takes the vote live and publishes the results. Committee members can vote but can't be nominated.{canAppoint ? ' The President and admins appoint the committee.' : ''}</p>
      <div className="stack sm-gap">
        {committee.map((u) => {
          const seen = lastSignIn(u);
          // Someone who signed up twice: the role must be on the account they actually sign in with
          const twin = canAppoint ? lookalikes(users, u).filter((x) => !x.roles.includes('electoral') && !x.roles.includes('alumni') && lastUsed(x) && (!lastUsed(u) || lastUsed(x) > lastUsed(u))).sort((a, b) => String(lastUsed(b) || '').localeCompare(String(lastUsed(a) || '')))[0] : null;
          const stale = seen === 'never' || (lastUsed(u) && Date.now() - new Date(lastUsed(u)) > 3 * 864e5);
          return (
            <div className={`el-member ${canAppoint && (stale || twin) ? 'warn' : ''}`} key={u.id}>
              <Avatar user={u} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{u.name}</b>
                <div className="muted tiny">{u.voice || 'Member'}{canAppoint && <> · {u.email}{seen && <> · {seen === 'never' ? <span className="warn-text">never used</span> : `active ${seen}`}</>}</>}</div>
                {canAppoint && twin && (
                  <div className="dup-note">
                    ⚠ {u.name} has another account, {twin.email}{lastSignIn(twin) ? ` (active ${lastSignIn(twin)})` : ''}. If that's the one they use, move the role there.
                    <button className="btn btn-sm btn-pri" onClick={() => { appoint(twin); remove(u); }}>Move role to {twin.email}</button>
                  </div>
                )}
                {canAppoint && !twin && stale && (() => {
                  // Accounts with the same first name, most recently used first — the admin decides if one is the same person
                  const first = u.name.trim().split(/\s+/)[0].toLowerCase();
                  const similar = users.filter((x) => x.id !== u.id && (x.status || 'active') === 'active' && !x.roles.includes('electoral') && !x.roles.includes('alumni') && x.name.trim().split(/\s+/)[0].toLowerCase() === first)
                    .sort((a, b) => String(lastUsed(b) || '').localeCompare(String(lastUsed(a) || ''))).slice(0, 3);
                  return (
                    <div className="dup-note">
                      <span>⚠ This account {seen === 'never' ? 'has never been used' : `was last used ${seen}`}. Ask {u.name.split(' ')[0]} which email they sign in with — the role must be on that account.</span>
                      {similar.map((x) => (
                        <span key={x.id} className="dup-alt">Similar name: <b>{x.name}</b> · {x.email}{lastSignIn(x) ? ` · active ${lastSignIn(x)}` : ''} <button className="btn btn-sm btn-soft" onClick={() => { appoint(x); remove(u); }}>Move role here</button></span>
                      ))}
                    </div>
                  );
                })()}
              </div>
              {canAppoint && <button className="btn btn-sm btn-danger-soft" onClick={() => remove(u)}>Remove</button>}
            </div>
          );
        })}
        {!committee.length && <p className="muted small">Nobody is on the committee yet.</p>}
      </div>
      {canAppoint && (
        <div className="el-start-row el-appoint">
          <select className="input" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Choose a member to appoint">
            <option value="">Choose a member to appoint…</option>
            {options.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.email}{lastSignIn(m) === 'never' ? ' · never used' : ''}</option>)}
          </select>
          <button className="btn btn-pri" disabled={!pick} onClick={() => { const u = members.find((m) => m.id === pick); if (u) { appoint(u); setPick(''); } }}><Icon name="plus" size={14} /> Appoint</button>
        </div>
      )}
      {canAppoint && running && <p className="muted tiny">An election is in progress: anyone you appoint now is taken off its eligibility lists the next time the committee saves them.</p>}
    </div>
  );
}

/* ---------- A short guide for the committee ---------- */
// A short checklist on the committee's own page: what to do now, and what comes next
const QUICK = [
  ['setup', 'Choose the offices and who is eligible for each', 'Add offices from the list (or "New office"), then add eligible members — at least 2 per office.'],
  ['nominations', 'Collect nominations — or skip them', '"Publish for nominations" lets members nominate; "Skip nominations" lets you choose the candidates yourselves.'],
  ['review', 'Confirm the candidates', 'Tick at least 2 candidates per office, then "Publish candidates".'],
  ['ballot', 'Go live', 'When the choir is ready, press "Go live". Members are told at once and can vote.'],
  ['live', 'Watch the vote, then close it', 'Results update live here (members can\'t see them). Press "Close voting" when time is up.'],
  ['closed', 'Check the count', 'A tied office can go to a run-off ("Hold a run-off"). Otherwise publish the results.'],
  ['published', 'Results are out', 'Every member can see the winners. Start the next election when it\'s due.'],
];
function QuickGuide({ cycle, committee, openGuide }) {
  const key = 'avc_el_quickguide_hidden';
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(key) === '1'; } catch { return false; } });
  const toggle = () => setHidden((h) => { try { localStorage.setItem(key, h ? '0' : '1'); } catch { /* private window */ } return !h; });
  const at = QUICK.findIndex(([k]) => k === cycle.stage);
  if (hidden) return <button className="link-btn el-qg-show" onClick={toggle}><Icon name="note" size={12} /> Show the step-by-step guide</button>;
  return (
    <div className="el-qg">
      <div className="el-qg-h">
        <b><Icon name="note" size={14} /> {committee ? 'Your step-by-step guide' : 'Where the election is'}</b>
        <span><button className="link-btn" onClick={openGuide}>Full guide</button> · <button className="link-btn" onClick={toggle}>Hide</button></span>
      </div>
      <ol>
        {QUICK.map(([k, title, how], i) => (
          <li key={k} className={i < at ? 'done' : i === at ? 'now' : ''}>
            <span className="el-qg-n">{i < at ? <Icon name="check" size={11} /> : i + 1}</span>
            <div><b>{title}{k === 'nominations' && cycle.skippedNominations ? ' (skipped)' : ''}</b>{i === at && <p>{committee || ['ballot', 'live', 'closed'].includes(k) ? how : 'The Electoral Committee is working on this step.'}</p>}</div>
          </li>
        ))}
      </ol>
      {cycle.mock && <p className="muted tiny" style={{ margin: 0 }}>This is a practice election — try every button; nothing is kept.</p>}
    </div>
  );
}

function Guide() {
  const steps = [
    ['Practise first', 'New to this? Press "Run a practice election". It works exactly like a real one, is marked Practice everywhere, and is deleted when you end it.'],
    ['1 · Offices & eligibility', 'Add the offices up for election from the dropdown (President, Secretary, Provost, Custodian 1 and 2, P.R.O., Choir Master, Assistant Choir Master). If the choir creates a new office, choose "New office" and type its name; the pencil renames one. For each office, add the eligible members (or "All members"). Each office needs at least 2. Members see nothing yet.'],
    ['2 · Nominations (optional)', 'Publish for nominations: members pick one eligible person per office. You see the counts and who nominated whom, live. Or press "Skip nominations" to choose the candidates yourselves.'],
    ['3 · Candidates', 'Close nominations. Everyone nominated is ticked for you — untick or tick any eligible member. Each office needs at least 2 candidates. Then publish the candidates.'],
    ['4 · Go live', 'When the choir is ready, the committee, the President or an admin presses Go live. Members are notified and vote once per office; ballots are secret.'],
    ['5 · Count', 'Close voting. Only the committee, the President and admins see the numbers (they update live while voting is open).'],
    ['6 · Ties', 'If the top candidates are level, press "Hold a run-off". Only the tied offices vote again, between the tied candidates; other offices keep their result. Go live again, then close.'],
    ['7 · Publish', 'Publish the results — every member sees the winners. Starting the next election moves these results to History.'],
  ];
  const rules = [
    'Committee members can vote but can\'t be eligible or nominated — the committee is neutral.',
    'Old Members can follow the election but can\'t nominate or vote.',
    'Nobody — not even admins — can see who voted for whom. Only totals are counted.',
    'An election can be cancelled before voting starts; after that it must be finished. A practice can be ended at any time.',
    'Every step is recorded with who took it, in the Security log.',
  ];
  return (
    <div className="card el-guide">
      <div className="card-h"><h3>Election guide</h3><span className="chip sm">For the committee</span></div>
      <ol className="el-guide-steps">{steps.map(([h, t]) => <li key={h}><b>{h}</b><span>{t}</span></li>)}</ol>
      <h4>Good to know</h4>
      <ul className="el-guide-rules">{rules.map((r) => <li key={r}>{r}</li>)}</ul>
    </div>
  );
}
