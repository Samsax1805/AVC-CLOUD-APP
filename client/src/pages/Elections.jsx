import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { TODAY, uid, fmtDate, POSTS } from '../utils/helpers';
import { PERMS, participates } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Avatar from '../components/ui/Avatar';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import Pagination, { usePaged } from '../components/ui/Pagination';
import api from '../services/api';

const totalOf = (e) => Object.values(e.votes || {}).reduce((a, b) => a + b, 0);
const joinedYear = (u) => { const y = new Date((u?.joined || '') + 'T00:00:00').getFullYear(); return Number.isFinite(y) ? y : null; };
const sameResults = (a, b) => a.length === b.length && a.every((x) => {
  const y = b.find((z) => z.id === x.id);
  return y && y.status === x.status && JSON.stringify(y.votes) === JSON.stringify(x.votes) && (y.votedIds || []).length === (x.votedIds || []).length;
});

export default function ElectionsPage({ ctx }) {
  const { me, users, members = [], elections, setElections, nominations, setNominations, log, toast, pendingNoms, setPendingNoms, notify } = ctx;
  const manage = PERMS.manageElections(me);
  const canGoLive = PERMS.goLiveElection(me);
  const canVote = participates(me);
  const [tab, setTab] = useState(manage ? 'polls' : 'vote');
  const [draftNom, setDraftNom] = useState(() => JSON.parse(JSON.stringify(nominations || {})));
  const [nomDirty, setNomDirty] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newPost, setNewPost] = useState('');
  const [newCands, setNewCands] = useState([]);
  const [selVote, setSelVote] = useState({});
  const [voting, setVoting] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const pollsPaged = usePaged(elections, 6);
  const findUser = (id) => users.find((u) => u.id === id);
  const isEligible = (id) => members.some((m) => m.id === id);
  const latest = useRef(elections);
  latest.current = elections;

  // Nomination list follows the saved one until the committee starts editing it
  useEffect(() => { if (!nomDirty) setDraftNom(JSON.parse(JSON.stringify(nominations || {}))); }, [nominations, nomDirty]);

  // Live results: refresh vote totals from the server while any poll is open
  const anyLive = elections.some((e) => e.status === 'live');
  useEffect(() => {
    if (!anyLive) return;
    const t = setInterval(() => {
      api.get('/elections').then(({ data }) => { if (!sameResults(latest.current, data)) setElections(data); }).catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, [anyLive]); // eslint-disable-line react-hooks/exhaustive-deps

  const togNom = (post, pid) => {
    setNomDirty(true);
    setDraftNom((d) => { const cur = d[post] || []; return { ...d, [post]: cur.includes(pid) ? cur.filter((x) => x !== pid) : [...cur, pid] }; });
  };
  const saveNoms = () => { setNominations(JSON.parse(JSON.stringify(draftNom))); setNomDirty(false); log('ELECTION', 'Updated the nomination list'); toast('Nomination list saved'); };
  const addSuggestion = (s) => {
    const add = (n) => ({ ...n, [s.post]: [...new Set([...(n[s.post] || []), s.cand])] });
    setNominations(add); setDraftNom(add);
    setPendingNoms((p) => p.filter((x) => x.id !== s.id));
    log('ELECTION', `Approved suggestion: ${findUser(s.cand)?.name} for ${s.post}`); toast('Added to nomination list');
  };
  // A post can hold a new election once its previous poll is closed
  const eligibleNoms = (post) => (nominations[post] || []).filter(isEligible);
  const availPosts = POSTS.filter((p) => eligibleNoms(p).length >= 2 && !elections.some((e) => e.post === p && e.status !== 'closed'));
  const createPoll = () => {
    if (!newPost || newCands.length < 2) return toast('Pick a post and at least 2 candidates', 'err');
    setElections((p) => [{ id: uid('e'), post: newPost, candidateIds: newCands, status: 'draft', votes: Object.fromEntries(newCands.map((c) => [c, 0])), votedIds: [], choice: {}, created: TODAY }, ...p]);
    log('ELECTION', `Created poll for ${newPost}`); toast('Poll created as draft'); setCreateOpen(false); setNewPost(''); setNewCands([]);
  };
  const setStatus = (id, status) => {
    if (status === 'live' && !canGoLive) return toast('Only the President can take an election live', 'err');
    const el = elections.find((e) => e.id === id);
    setElections((p) => p.map((e) => (e.id === id ? { ...e, status, ...(status === 'closed' ? { closed: TODAY } : {}) } : e)));
    log('ELECTION', `${status === 'live' ? 'Made voting LIVE for' : 'Closed voting for'} ${el.post}`);
    if (status === 'live') notify(`Voting is now LIVE for the ${el.post} post — cast your vote!`);
    if (status === 'closed') notify(`Voting has closed for ${el.post} — the final result is published.`);
    toast(status === 'live' ? 'Poll is now LIVE — members can vote!' : 'Poll closed. Final results published.');
  };
  const deletePoll = (e) => {
    setElections((p) => p.filter((x) => x.id !== e.id));
    log('ELECTION', `Deleted draft poll for ${e.post}`); toast('Poll deleted'); setConfirmDel(null);
  };
  // Votes are counted by the server: one secret ballot per member, safe from simultaneous voting
  const castVote = async (e, candId) => {
    if (!canVote) return toast('Old Members can follow elections but not vote', 'err');
    if (voting) return;
    setVoting(e.id);
    try {
      const { data } = await api.post(`/elections/${e.id}/vote`, { candId });
      setElections((p) => p.map((x) => (x.id === e.id ? data : x)));
      log('VOTE', `Voted in the ${e.post} election`); toast('Your vote has been cast 🗳️');
    } catch (err) {
      toast(err.response?.data?.msg || 'Your vote could not be recorded — please try again', 'err');
      if (err.response?.status === 409) api.get('/elections').then(({ data }) => setElections(data)).catch(() => {});
    } finally { setVoting(null); }
  };

  const ResultBars = ({ e, final }) => {
    const total = totalOf(e) || 1;
    const max = Math.max(...e.candidateIds.map((c) => e.votes?.[c] || 0), 0);
    const leaders = e.candidateIds.filter((c) => max > 0 && (e.votes?.[c] || 0) === max);
    const tie = final && leaders.length > 1;
    return (
      <div className="res-list">
        {tie && <div className="voted-note"><Icon name="vote" size={14} /> Tie between {leaders.map((c) => findUser(c)?.name || 'a former member').join(' and ')} — the Electoral Committee will decide the next step.</div>}
        {e.candidateIds.map((cid) => {
          const u = findUser(cid); const v = e.votes?.[cid] || 0; const pct = Math.round((v / total) * 100);
          const isWin = final && !tie && leaders.includes(cid);
          return (
            <div className="res-row" key={cid}>
              <Avatar user={u} size={30} />
              <span className="res-name">{u?.name || 'Former member'} {isWin && <span className="win-tag">🏆 Winner</span>}</span>
              <div className="res-track"><motion.div className="res-fill" initial={{ width: 0 }} animate={{ width: pct + '%' }} transition={{ duration: 0.7 }} style={{ background: isWin ? '#059669' : '#d18f26' }} /></div>
              <span className="res-num">{v} · {pct}%</span>
            </div>
          );
        })}
      </div>
    );
  };
  const StatusBadge = ({ s }) => (
    <span className={`status-badge ${s}`}>{s === 'live' && <span className="live-dot" />}{s === 'draft' ? 'Draft' : s === 'live' ? 'LIVE' : 'Closed'}</span>
  );
  const PollCard = ({ e }) => (
    <div className="card poll-card">
      <div className="poll-h">
        <div><h3>{e.post}</h3><span className="muted tiny">Created {fmtDate(e.created)} · {e.candidateIds.length} candidates · {totalOf(e)} votes · {(e.votedIds || []).length} voted</span></div>
        <StatusBadge s={e.status} />
      </div>
      <ResultBars e={e} final={e.status === 'closed'} />
      <div className="poll-actions">
        {e.status === 'draft' && <>{canGoLive ? <button className="btn btn-pri btn-sm" onClick={() => setStatus(e.id, 'live')}><Icon name="play" size={13} /> Go live</button> : <span className="chip sm">Waiting for the President to go live</span>}<button className="btn btn-sm btn-danger-soft" onClick={() => setConfirmDel(e)}><Icon name="trash" size={13} /> Delete</button></>}
        {e.status === 'live' && <button className="btn btn-sm btn-soft" onClick={() => setStatus(e.id, 'closed')}><Icon name="check" size={13} /> Close poll & publish final result</button>}
        {e.status === 'closed' && <span className="chip sm">Final result{e.closed ? ` · closed ${fmtDate(e.closed)}` : ''} — visible to all members</span>}
      </div>
    </div>
  );

  const live = elections.filter((e) => e.status === 'live');
  const drafts = elections.filter((e) => e.status === 'draft');
  const closed = elections.filter((e) => e.status === 'closed');

  const VotingBooth = () => (
    <div className="stack">
      {live.map((e) => {
        const myChoice = e.choice?.[me.id];
        return (
          <div className="card poll-card" key={e.id}>
            <div className="poll-h">
              <div><h3>{e.post}</h3><span className="muted tiny">{totalOf(e)} votes so far · updates every few seconds</span></div>
              <StatusBadge s="live" />
            </div>
            {!canVote ? (
              <><div className="voted-note"><Icon name="eye" size={14} /> Old Members can follow the results but not vote.</div><ResultBars e={e} /></>
            ) : !myChoice ? (
              <>
                <div className="stack sm-gap">
                  {e.candidateIds.map((cid) => {
                    const u = findUser(cid); const sel = selVote[e.id] === cid; const yr = joinedYear(u);
                    return (
                      <button key={cid} className={`cand-row ${sel ? 'sel' : ''}`} onClick={() => setSelVote((s) => ({ ...s, [e.id]: cid }))}>
                        <Avatar user={u} size={34} />
                        <div style={{ flex: 1, textAlign: 'left' }}><b>{u?.name || 'Former member'}</b><div className="muted tiny">{[u?.voice, yr && `joined ${yr}`].filter(Boolean).join(' · ')}</div></div>
                        <span className={`radio ${sel ? 'sel' : ''}`} />
                      </button>
                    );
                  })}
                </div>
                <p className="muted tiny" style={{ marginTop: 8 }}>Your ballot is secret — only the totals are shown. You can vote once.</p>
                <div className="poll-actions"><button className="btn btn-pri" disabled={!selVote[e.id] || voting === e.id} onClick={() => castVote(e, selVote[e.id])}><Icon name="vote" size={15} /> {voting === e.id ? 'Recording…' : 'Cast my vote'}</button></div>
              </>
            ) : (
              <><div className="voted-note"><Icon name="check" size={14} /> You voted for <b>{findUser(myChoice)?.name}</b>. Watching live results…</div><ResultBars e={e} /></>
            )}
          </div>
        );
      })}
      {!manage && drafts.map((e) => (
        <div className="card poll-card" key={e.id}>
          <div className="poll-h"><div><h3>{e.post}</h3><span className="muted tiny">{canGoLive ? 'Ready for you to open — members can vote as soon as it goes live.' : 'Waiting for the President to open this poll.'}</span></div><StatusBadge s="draft" /></div>
          {canGoLive && <div className="poll-actions"><button className="btn btn-pri btn-sm" onClick={() => setStatus(e.id, 'live')}><Icon name="play" size={13} /> Go live</button></div>}
        </div>
      ))}
      {!live.length && (manage || !drafts.length) && <EmptyState icon="vote" text="No polls are open for voting right now." />}
      {canVote && !manage && <div className="card">
        <div className="card-h"><h3>Suggest a nomination</h3><span className="chip sm">Goes to the Electoral Committee</span></div>
        <SuggestNom ctx={ctx} />
      </div>}
    </div>
  );

  const deleteModal = (
    <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Delete draft poll">
      <p className="small">Delete the draft poll for <b>{confirmDel?.post}</b>? Nobody has voted in it yet.</p>
      <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>Cancel</button><button className="btn btn-pri" onClick={() => deletePoll(confirmDel)}>Delete</button></div>
    </Modal>
  );

  /* ================= ELECTORAL COMMITTEE VIEW ================= */
  if (manage) {
    return (
      <div className="stack">
        <div className="page-head">
          <div><h2>Election Centre</h2><p className="muted small">Build the nomination list and create polls. The President takes polls live.</p></div>
          <button className="btn btn-pri" onClick={() => setCreateOpen(true)}><Icon name="plus" size={15} /> Create poll</button>
        </div>
        <div className="chip-row">
          <button className={`chip lg ${tab === 'polls' ? 'on' : ''}`} onClick={() => setTab('polls')}>Polls & Results</button>
          <button className={`chip lg ${tab === 'vote' ? 'on' : ''}`} onClick={() => setTab('vote')}>Voting Booth{live.length ? ` (${live.length})` : ''}</button>
          <button className={`chip lg ${tab === 'nominations' ? 'on' : ''}`} onClick={() => setTab('nominations')}>Nomination List</button>
        </div>
        {tab === 'polls' && (
          <>
            <div className="grid g2">
              {pollsPaged.items.map((e) => <PollCard key={e.id} e={e} />)}
              {!elections.length && <EmptyState icon="vote" text="No polls yet — create one!" />}
            </div>
            <Pagination paged={pollsPaged} label="polls" />
          </>
        )}
        {tab === 'vote' && <VotingBooth />}
        {tab === 'nominations' && (
          <div className="stack">
            {pendingNoms.length > 0 && (
              <div className="card pend-card">
                <div className="card-h"><h3>Member suggestions</h3><span className="chip sm">Approve to add to the list</span></div>
                <div className="stack sm-gap">
                  {pendingNoms.map((s) => {
                    const already = (nominations[s.post] || []).includes(s.cand);
                    return (
                      <div className="roster-row" key={s.id} style={{ border: '1px solid #e3d8c2', borderRadius: 10 }}>
                        <Avatar user={findUser(s.cand)} size={30} />
                        <div style={{ flex: 1 }}><b>{findUser(s.cand)?.name || 'Former member'}</b> for <b>{s.post}</b><div className="muted tiny">suggested by {s.by}{already ? ' · already on the list' : ''}</div></div>
                        {!already && isEligible(s.cand) && <button className="btn btn-sm btn-pri" onClick={() => addSuggestion(s)}><Icon name="check" size={13} /> Add</button>}
                        <button className="btn btn-sm btn-danger-soft" onClick={() => setPendingNoms((p) => p.filter((x) => x.id !== s.id))} title="Dismiss"><Icon name="x" size={13} /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="grid g2">
              {POSTS.map((p) => (
                <div className="card nom-card" key={p}>
                  <div className="nom-h"><h4>{p}</h4><span className="chip sm">{(draftNom[p] || []).filter(isEligible).length} nominated</span></div>
                  <div className="nom-grid">
                    {members.map((u) => {
                      const on = (draftNom[p] || []).includes(u.id);
                      return (
                        <button key={u.id} className={`nom-chip ${on ? 'on' : ''}`} onClick={() => togNom(p, u.id)}>
                          <Avatar user={u} size={22} />{u.name.split(' ')[0]}{on && <Icon name="check" size={12} />}
                        </button>
                      );
                    })}
                    {!members.length && <span className="muted tiny">No active members yet.</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-foot">{nomDirty && <span className="muted small" style={{ marginRight: 'auto' }}>Unsaved changes</span>}<button className="btn btn-pri" onClick={saveNoms}><Icon name="check" size={15} /> Save nomination list</button></div>
          </div>
        )}
        <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create a new poll">
          <div className="field"><label className="label">Post</label>
            <select className="input" value={newPost} onChange={(e) => { setNewPost(e.target.value); setNewCands(eligibleNoms(e.target.value)); }}>
              <option value="">Select a post…</option>
              {availPosts.map((p) => <option key={p}>{p}</option>)}
            </select>
            {!availPosts.length && <p className="muted tiny" style={{ marginTop: 6 }}>No post is ready: a post needs at least 2 active nominees and no open or draft poll. Edit the nomination list first.</p>}
          </div>
          {newPost && (
            <div className="field"><label className="label">Candidates (from nomination list)</label>
              <div className="nom-grid">
                {eligibleNoms(newPost).map((cid) => {
                  const u = findUser(cid); const on = newCands.includes(cid);
                  return <button key={cid} className={`nom-chip ${on ? 'on' : ''}`} onClick={() => setNewCands((c) => (on ? c.filter((x) => x !== cid) : [...c, cid]))}><Avatar user={u} size={22} />{u?.name}{on && <Icon name="check" size={12} />}</button>;
                })}
              </div>
            </div>
          )}
          <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setCreateOpen(false)}>Cancel</button><button className="btn btn-pri" onClick={createPoll}>Create draft poll</button></div>
        </Modal>
        {deleteModal}
      </div>
    );
  }

  /* ================= MEMBER VIEW ================= */
  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Elections</h2><p className="muted small">Cast your vote when polls are live — ballots are secret and results refresh every few seconds.</p></div>
      </div>
      <div className="chip-row">
        <button className={`chip lg ${tab === 'vote' ? 'on' : ''}`} onClick={() => setTab('vote')}>Voting Booth</button>
        <button className={`chip lg ${tab === 'results' ? 'on' : ''}`} onClick={() => setTab('results')}>Final Results</button>
      </div>
      {tab === 'vote' && <VotingBooth />}
      {tab === 'results' && (
        <div className="grid g2">
          {closed.map((e) => (
            <div className="card poll-card" key={e.id}>
              <div className="poll-h"><div><h3>{e.post}</h3><span className="muted tiny">Final election result · {fmtDate(e.closed || e.created)}</span></div><StatusBadge s="closed" /></div>
              <ResultBars e={e} final />
            </div>
          ))}
          {!closed.length && <EmptyState icon="vote" text="No final results published yet." />}
        </div>
      )}
      {deleteModal}
    </div>
  );
}

/* ---- Member nomination suggestion form ---- */
function SuggestNom({ ctx }) {
  const { me, users, members = [], pendingNoms = [], setPendingNoms, log, toast, notify } = ctx;
  const [post, setPost] = useState(POSTS[0]);
  const [cand, setCand] = useState('');
  const submit = () => {
    if (!cand) return toast('Choose a member to nominate', 'err');
    if (pendingNoms.some((s) => s.post === post && s.cand === cand)) return toast('That nomination has already been suggested', 'err');
    setPendingNoms((p) => [...p, { id: uid('pn'), post, cand, by: me.name }]);
    log('NOM_SUGGEST', `Suggested ${users.find((u) => u.id === cand)?.name} for ${post}`);
    notify(`New nomination suggestion for ${post}`);
    toast('Suggestion sent to the Electoral Committee');
    setCand('');
  };
  return (
    <div className="grant-cell">
      <select className="input sm" value={post} onChange={(e) => setPost(e.target.value)}>{POSTS.map((p) => <option key={p}>{p}</option>)}</select>
      <select className="input sm" value={cand} onChange={(e) => setCand(e.target.value)}><option value="">Choose member…</option>{members.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
      <button className="btn btn-sm btn-pri" onClick={submit}>Submit</button>
    </div>
  );
}