import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { TODAY, uid, fmtDate, POSTS } from '../utils/helpers';
import { PERMS } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Avatar from '../components/ui/Avatar';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';

export default function Elections({ ctx }) {
  const { me, users, elections, setElections, nominations, setNominations, pendingNoms, setPendingNoms, log, toast, notify } = ctx;
  const manage = PERMS.manageElections(me);
  const [tab, setTab] = useState(manage ? 'polls' : 'vote');
  const [draftNom, setDraftNom] = useState(() => JSON.parse(JSON.stringify(nominations)));
  const [createOpen, setCreateOpen] = useState(false);
  const [newPost, setNewPost] = useState('');
  const [newCands, setNewCands] = useState([]);
  const [selVote, setSelVote] = useState({});
  const [sugPost, setSugPost] = useState(POSTS[0]);
  const [sugCand, setSugCand] = useState('u2');
  const findUser = (id) => users.find((u) => u.id === id);

  const togNom = (post, pid) => setDraftNom((d) => ({ ...d, [post]: d[post].includes(pid) ? d[post].filter((x) => x !== pid) : [...d[post], pid] }));
  const saveNoms = () => { setNominations(JSON.parse(JSON.stringify(draftNom))); log('ELECTION', 'Updated the nomination list'); toast('Nomination list saved'); };
  const availPosts = POSTS.filter((p) => (nominations[p]?.length || 0) >= 2 && !elections.some((e) => e.post === p));
  const createPoll = () => {
    if (!newPost || newCands.length < 2) return toast('Pick a post and at least 2 candidates', 'err');
    setElections((p) => [{ id: uid('e'), post: newPost, candidateIds: newCands, status: 'draft', votes: Object.fromEntries(newCands.map((c) => [c, 0])), votedIds: [], choice: {}, created: TODAY }, ...p]);
    log('ELECTION', `Created poll for ${newPost}`); toast('Poll created as draft'); setCreateOpen(false); setNewPost(''); setNewCands([]);
  };
  const setStatus = (id, status) => {
    const el = elections.find((e) => e.id === id);
    setElections((p) => p.map((e) => (e.id === id ? { ...e, status } : e)));
    log('ELECTION', `${status === 'live' ? 'Made voting LIVE for' : status === 'closed' ? 'Closed voting for' : 'Reopened'} ${el.post}`);
    if (status === 'live') notify(`Voting is now LIVE for the ${el.post} post — cast your vote!`);
    toast(status === 'live' ? 'Poll is now LIVE — members can vote in real time!' : status === 'closed' ? 'Poll closed. Final results published.' : 'Poll moved to draft');
  };
  const castVote = (e, candId) => {
    setElections((p) => p.map((x) => (x.id === e.id ? { ...x, votes: { ...x.votes, [candId]: (x.votes[candId] || 0) + 1 }, votedIds: [...x.votedIds, me.id], choice: { ...x.choice, [me.id]: candId } } : x)));
    log('VOTE', `Voted in the ${e.post} election`); toast('Your vote has been cast 🗳️');
  };
  const suggest = () => {
    setPendingNoms((p) => [...p, { id: uid('pn'), post: sugPost, cand: sugCand, by: me.name }]);
    log('NOM_SUGGEST', `Suggested ${findUser(sugCand)?.name} for ${sugPost}`);
    notify(`New nomination suggestion for ${sugPost}`); toast('Suggestion sent to the Electoral Committee');
  };

  const ResultBars = ({ e, winner }) => {
    const total = Object.values(e.votes).reduce((a, b) => a + b, 0) || 1;
    const max = Math.max(...e.candidateIds.map((c) => e.votes[c] || 0), 0);
    return (
      <div className="res-list">
        {e.candidateIds.map((cid) => {
          const u = findUser(cid); const v = e.votes[cid] || 0; const pct = Math.round((v / total) * 100);
          const isWin = winner && max > 0 && v === max;
          return (
            <div className="res-row" key={cid}>
              <Avatar user={u} size={30} />
              <span className="res-name">{u?.name} {isWin && <span className="win-tag">🏆 Winner</span>}</span>
              <div className="res-track"><motion.div className="res-fill" initial={{ width: 0 }} animate={{ width: pct + '%' }} transition={{ duration: 0.7 }} style={{ background: isWin ? '#059669' : '#d18f26' }} /></div>
              <span className="res-num">{v} · {pct}%</span>
            </div>
          );
        })}
      </div>
    );
  };
  const StatusBadge = ({ s }) => (<span className={`status-badge ${s}`}>{s === 'live' && <span className="live-dot" />}{s === 'draft' ? 'Draft' : s === 'live' ? 'LIVE' : 'Closed'}</span>);

  if (manage) {
    return (
      <div className="stack">
        <div className="page-head">
          <div><h2>Election Centre</h2><p className="muted small">Build the nomination list, create polls and take elections live.</p></div>
          <button className="btn btn-pri" onClick={() => setCreateOpen(true)}><Icon name="plus" size={15} /> Create poll</button>
        </div>
        <div className="chip-row">
          <button className={`chip lg ${tab === 'polls' ? 'on' : ''}`} onClick={() => setTab('polls')}>Polls & Results</button>
          <button className={`chip lg ${tab === 'nominations' ? 'on' : ''}`} onClick={() => setTab('nominations')}>Nomination List</button>
        </div>
        {tab === 'polls' && (
          <div className="grid g2">
            {elections.map((e) => {
              const total = Object.values(e.votes).reduce((a, b) => a + b, 0);
              return (
                <div className="card poll-card" key={e.id}>
                  <div className="poll-h">
                    <div><h3>{e.post}</h3><span className="muted tiny">Created {fmtDate(e.created)} · {e.candidateIds.length} candidates · {total} votes</span></div>
                    <StatusBadge s={e.status} />
                  </div>
                  <ResultBars e={e} winner={e.status === 'closed'} />
                  <div className="poll-actions">
                    {e.status === 'draft' && <><button className="btn btn-pri btn-sm" onClick={() => setStatus(e.id, 'live')}><Icon name="play" size={13} /> Go live</button><button className="btn btn-sm btn-danger-soft" onClick={() => { setElections((p) => p.filter((x) => x.id !== e.id)); toast('Poll deleted'); }}><Icon name="trash" size={13} /> Delete</button></>}
                    {e.status === 'live' && <button className="btn btn-sm btn-soft" onClick={() => setStatus(e.id, 'closed')}><Icon name="check" size={13} /> Close poll & publish final result</button>}
                    {e.status === 'closed' && <span className="chip sm">Final result — visible to all members</span>}
                  </div>
                </div>
              );
            })}
            {!elections.length && <EmptyState icon="vote" text="No polls yet — create one!" />}
          </div>
        )}
        {tab === 'nominations' && (
          <div className="stack">
            {pendingNoms.length > 0 && (
              <div className="card pend-card">
                <div className="card-h"><h3>Member suggestions</h3><span className="chip sm">Approve to add to the list</span></div>
                <div className="stack sm-gap">
                  {pendingNoms.map((s) => (
                    <div className="roster-row" key={s.id} style={{ border: '1px solid #e3d8c2', borderRadius: 10 }}>
                      <Avatar user={findUser(s.cand)} size={30} />
                      <div style={{ flex: 1 }}><b>{findUser(s.cand)?.name}</b> for <b>{s.post}</b><div className="muted tiny">suggested by {s.by}</div></div>
                      <button className="btn btn-sm btn-pri" onClick={() => { setNominations((n) => ({ ...n, [s.post]: [...(n[s.post] || []), s.cand] })); setDraftNom((d) => ({ ...d, [s.post]: [...(d[s.post] || []), s.cand] })); setPendingNoms((p) => p.filter((x) => x.id !== s.id)); log('ELECTION', `Approved suggestion: ${findUser(s.cand)?.name} for ${s.post}`); toast('Added to nomination list'); }}><Icon name="check" size={13} /> Add</button>
                      <button className="btn btn-sm btn-danger-soft" onClick={() => setPendingNoms((p) => p.filter((x) => x.id !== s.id))}><Icon name="x" size={13} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid g2">
              {POSTS.map((p) => (
                <div className="card nom-card" key={p}>
                  <div className="nom-h"><h4>{p}</h4><span className="chip sm">{(draftNom[p] || []).length} nominated</span></div>
                  <div className="nom-grid">
                    {users.filter((u) => u.id !== 'u1').map((u) => {
                      const on = draftNom[p]?.includes(u.id);
                      return (<button key={u.id} className={`nom-chip ${on ? 'on' : ''}`} onClick={() => togNom(p, u.id)}><Avatar user={u} size={22} />{u.name.split(' ')[0]}{on && <Icon name="check" size={12} />}</button>);
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-foot"><button className="btn btn-pri" onClick={saveNoms}><Icon name="check" size={15} /> Save nomination list</button></div>
          </div>
        )}
        <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create a new poll">
          <div className="field"><label className="label">Post</label>
            <select className="input" value={newPost} onChange={(e) => { setNewPost(e.target.value); setNewCands(nominations[e.target.value] || []); }}>
              <option value="">Select a post…</option>
              {availPosts.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          {newPost && (
            <div className="field"><label className="label">Candidates (from nomination list)</label>
              <div className="nom-grid">
                {(nominations[newPost] || []).map((cid) => {
                  const u = findUser(cid); const on = newCands.includes(cid);
                  return <button key={cid} className={`nom-chip ${on ? 'on' : ''}`} onClick={() => setNewCands((c) => (on ? c.filter((x) => x !== cid) : [...c, cid]))}><Avatar user={u} size={22} />{u?.name}{on && <Icon name="check" size={12} />}</button>;
                })}
              </div>
            </div>
          )}
          <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setCreateOpen(false)}>Cancel</button><button className="btn btn-pri" onClick={createPoll}>Create draft poll</button></div>
        </Modal>
      </div>
    );
  }

  const live = elections.filter((e) => e.status === 'live');
  const drafts = elections.filter((e) => e.status === 'draft');
  const closed = elections.filter((e) => e.status === 'closed');
  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Elections</h2><p className="muted small">Cast your vote when polls are live — results update in real time.</p></div>
      </div>
      <div className="chip-row">
        <button className={`chip lg ${tab === 'vote' ? 'on' : ''}`} onClick={() => setTab('vote')}>Voting Booth</button>
        <button className={`chip lg ${tab === 'results' ? 'on' : ''}`} onClick={() => setTab('results')}>Final Results</button>
      </div>
      {tab === 'vote' && (
        <div className="stack">
          {live.map((e) => {
            const myChoice = e.choice?.[me.id];
            return (
              <div className="card poll-card" key={e.id}>
                <div className="poll-h">
                  <div><h3>{e.post}</h3><span className="muted tiny">{Object.values(e.votes).reduce((a, b) => a + b, 0)} votes so far · updating live</span></div>
                  <StatusBadge s="live" />
                </div>
                {!myChoice ? (<>
                  <div className="stack sm-gap">
                    {e.candidateIds.map((cid) => {
                      const u = findUser(cid); const sel = selVote[e.id] === cid;
                      return (
                        <button key={cid} className={`cand-row ${sel ? 'sel' : ''}`} onClick={() => setSelVote((s) => ({ ...s, [e.id]: cid }))}>
                          <Avatar user={u} size={34} />
                          <div style={{ flex: 1, textAlign: 'left' }}><b>{u?.name}</b><div className="muted tiny">{u?.voice} · joined {new Date(u?.joined + 'T00:00:00').getFullYear()}</div></div>
                          <span className={`radio ${sel ? 'sel' : ''}`} />
                        </button>
                      );
                    })}
                  </div>
                  <div className="poll-actions"><button className="btn btn-pri" disabled={!selVote[e.id]} onClick={() => castVote(e, selVote[e.id])}><Icon name="vote" size={15} /> Cast my vote</button></div>
                </>) : (<>
                  <div className="voted-note"><Icon name="check" size={14} /> You voted for <b>{findUser(myChoice)?.name}</b>. Watching live results…</div>
                  <ResultBars e={e} />
                </>)}
              </div>
            );
          })}
          {drafts.map((e) => (
            <div className="card poll-card" key={e.id}>
              <div className="poll-h"><div><h3>{e.post}</h3><span className="muted tiny">The Electoral Committee hasn't opened this poll yet.</span></div><StatusBadge s="draft" /></div>
            </div>
          ))}
          {!live.length && !drafts.length && <EmptyState icon="vote" text="No active elections right now." />}
          <div className="card">
            <div className="card-h"><h3>Suggest a nomination</h3><span className="chip sm">Goes to the Electoral Committee</span></div>
            <div className="grant-cell">
              <select className="input sm" value={sugPost} onChange={(e) => setSugPost(e.target.value)}>{POSTS.map((p) => <option key={p}>{p}</option>)}</select>
              <select className="input sm" value={sugCand} onChange={(e) => setSugCand(e.target.value)}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
              <button className="btn btn-sm btn-pri" onClick={suggest}>Submit</button>
            </div>
          </div>
        </div>
      )}
      {tab === 'results' && (
        <div className="grid g2">
          {closed.map((e) => (
            <div className="card poll-card" key={e.id}>
              <div className="poll-h"><div><h3>{e.post}</h3><span className="muted tiny">Final election result · {fmtDate(e.created)}</span></div><StatusBadge s="closed" /></div>
              <ResultBars e={e} winner />
            </div>
          ))}
          {!closed.length && <EmptyState icon="vote" text="No final results published yet." />}
        </div>
      )}
    </div>
  );
}