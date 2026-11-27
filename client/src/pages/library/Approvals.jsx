import React, { useCallback, useEffect, useState } from 'react';
import ItemEditor from './ItemEditor';
import {
  addApprover, approveItem, getItem, heldItems, listApprovers, listItems, loadLists, nextCode, problem, publishItem, removeApprover, sendBackItem,
} from '../../services/library';

// Approvals (design page 10): what is waiting, approving (the number is issued and the approval sealed),
// sending back with a reason, songs approved but held, and the Music Approvers.
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());

export default function Approvals({ ctx, perms }) {
  const { toast, me, users = [] } = ctx;
  const [waiting, setWaiting] = useState(null);
  const [held, setHeld] = useState([]);
  const [lists, setLists] = useState(null);
  const [review, setReview] = useState(null);
  const [act, setAct] = useState(null); // { uid, kind: 'approve' | 'back', ... }
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    // The Custodian approves only music that came from a member's song request
    listItems({ filter: 'awaiting', sort: 'oldest' }).then((d) => setWaiting(perms.approve ? d.items : d.items.filter((it) => it.request))).catch(() => setWaiting([]));
    heldItems().then(setHeld).catch(() => {});
  }, [perms.approve]);
  useEffect(() => { load(); loadLists().then(setLists).catch(() => {}); }, [load]);

  const startApprove = async (it) => {
    setAct({ uid: it.uid, kind: 'approve', publish: 'now', date: today(), notify: true, preview: '…' });
    try { const full = await getItem(it.uid); const code = await nextCode(full.d.type); setAct((a) => (a?.uid === it.uid ? { ...a, preview: code, type: full.d.type } : a)); } catch { /* the preview is only a guide */ }
  };
  const run = async (fn, ok) => { setBusy(true); try { const r = await fn(); toast(typeof ok === 'function' ? ok(r) : ok); setAct(null); load(); } catch (e) { toast(problem(e), 'err'); load(); } finally { setBusy(false); } };

  if (review) return <ItemEditor uid={review} lists={lists} me={me} perms={perms} toast={toast} onChanged={load} onClose={() => { setReview(null); load(); }} />;
  return (
    <div className="stack">
      <div className="card">
        <div className="lib-list-h"><div className="lib-side-h">Waiting for approval <span className="muted small">· {waiting?.length ?? '…'}</span></div></div>
        {waiting && !waiting.length && <p className="muted small" style={{ padding: '12px 0' }}>Nothing is waiting for approval.</p>}
        {!perms.approve && <p className="muted tiny" style={{ margin: '6px 0 0' }}>As Custodian you approve songs that came from members' song requests. Other music is approved by the Choir Master, Assistant Choir Master, President or admin.</p>}
        <div className="lib-rows" style={{ marginTop: 10 }}>
          {waiting?.map((it) => (
            <div key={it.uid} className="lib-row">
              <div className="lib-appr">
                <span className="lib-q">{it.ref}</span>
                <span className="lib-row-t"><b>{it.title}</b><span className="muted tiny">{it.request ? `Requested by ${it.request} · ` : ''}{it.files} file{it.files === 1 ? '' : 's'}{it.recording ? ' · recording' : ''}{it.live ? ' · published urgently' : ''}</span></span>
                <span className="chip-row lib-appr-btns">
                  <button type="button" className="btn btn-sm btn-soft" onClick={() => setReview(it.uid)}>Review</button>
                  <button type="button" className="btn btn-sm btn-danger-soft" onClick={() => setAct({ uid: it.uid, kind: 'back', reason: '' })}>Send back</button>
                  <button type="button" className="btn btn-sm btn-pri" onClick={() => startApprove(it)}>Approve ▾</button>
                </span>
              </div>
              {act?.uid === it.uid && act.kind === 'back' && (
                <div className="lib-act">
                  <label className="label" style={{ marginTop: 0 }}>What needs changing?</label>
                  <input className="input" autoFocus maxLength={300} value={act.reason} placeholder="e.g. The key should be D major" onChange={(e) => setAct({ ...act, reason: e.target.value })} />
                  <div className="chip-row" style={{ marginTop: 8 }}>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAct(null)}>Cancel</button>
                    <button type="button" className="btn btn-sm btn-danger-soft" disabled={busy || !act.reason.trim()} onClick={() => run(() => sendBackItem(it.uid, act.reason.trim()), `${it.ref} sent back`)}>Send back</button>
                  </div>
                </div>
              )}
              {act?.uid === it.uid && act.kind === 'approve' && (
                <div className="lib-act">
                  <div className="small"><b>{it.title}</b> becomes</div>
                  <div className="lib-big-code">{act.preview}</div>
                  <div className="muted tiny" style={{ marginBottom: 8 }}>A preview: the number is fixed by the server when you confirm. If someone approves another song first, you get the next one.</div>
                  <label className="label" style={{ marginTop: 0 }}>Publish</label>
                  <div className="chip-row">
                    {[['now', 'Now'], ['date', 'On a date…'], ['hold', 'Later (hold)']].map(([k, l]) => <button type="button" key={k} className={`chip sm ${act.publish === k ? 'on' : ''}`} onClick={() => setAct({ ...act, publish: k })}>{l}</button>)}
                    {act.publish === 'date' && <input type="date" className="input sm" style={{ width: 'auto' }} min={today()} value={act.date} onChange={(e) => setAct({ ...act, date: e.target.value })} aria-label="Publish on" />}
                  </div>
                  <label className="lib-check-line"><input type="checkbox" checked={act.notify} onChange={(e) => setAct({ ...act, notify: e.target.checked })} /> Tell members with one notification when it is published</label>
                  <div className="chip-row" style={{ marginTop: 8 }}>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAct(null)}>Cancel</button>
                    <button type="button" className="btn btn-sm btn-pri" disabled={busy} onClick={() => run(() => approveItem(it.uid, { publish: act.publish, date: act.date, notify: act.notify }), (item) => `Approved as ${item.code}${item.status === 'published' ? ' and published' : ''}`)}>{act.publish === 'now' ? 'Approve and publish' : 'Approve'}</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {held.length > 0 && (
        <div className="card">
          <div className="lib-side-h">Approved, waiting to publish</div>
          <div className="lib-rows" style={{ marginTop: 10 }}>
            {held.map((h) => (
              <div key={h.uid} className="lib-row"><div className="lib-appr">
                <span className="lib-code">{h.code}</span>
                <span className="lib-row-t"><b>{h.title}</b><span className="muted tiny">{h.publishAt ? `Publishes on ${new Date(h.publishAt).toLocaleDateString()}` : 'Held'} · approved by {h.approvedBy}</span></span>
                <span className="chip-row lib-appr-btns"><button type="button" className="btn btn-sm btn-pri" disabled={busy} onClick={() => run(() => publishItem(h.uid), `${h.code} published`)}>Publish now</button></span>
              </div></div>
            ))}
          </div>
        </div>
      )}

      <ApproversCard perms={perms} users={users} toast={toast} />
    </div>
  );
}

function ApproversCard({ perms, users, toast }) {
  const [a, setA] = useState(null);
  const [pick, setPick] = useState('');
  const [sure, setSure] = useState('');
  useEffect(() => { listApprovers().then(setA).catch(() => {}); }, []);
  const go = (p) => p.then(setA).catch((e) => toast(problem(e), 'err'));
  if (!a) return null;
  const taken = new Set([...a.byRole, ...a.added].map((x) => x.id));
  const candidates = users.filter((u) => (u.status || 'active') === 'active' && !(u.roles || []).includes('alumni') && !u.system && !taken.has(u.id)).sort((x, y) => x.name.localeCompare(y.name));
  return (
    <div className="card">
      <div className="lib-side-h">Music Approvers</div>
      <p className="muted tiny" style={{ margin: '4px 0 0' }}>Anyone given the Choir Master or Assistant Choir Master role in Members &amp; Roles approves music automatically. The President and admin are the back-up.</p>
      <div className="lib-rows" style={{ marginTop: 10 }}>
        {/* the two music roles always show, even before anyone holds them */}
        {['Choir Master', 'Assistant Choir Master'].filter((r) => !a.byRole.some((p) => p.role.split(', ').includes(r))).map((r) => (
          <div key={r} className="lib-row"><div className="lib-appr two"><span className="lib-row-t"><b className="muted">{r}: nobody yet</b><span className="muted tiny">Grant this role in Members &amp; Roles and that person can approve music straight away</span></span><span className="muted tiny">by role</span></div></div>
        ))}
        {a.byRole.map((p) => <div key={p.id} className="lib-row"><div className="lib-appr two"><span className="lib-row-t"><b>{p.name}</b></span><span className="muted tiny">{p.role}{/President|Admin/.test(p.role) && !/Choir Master/.test(p.role) ? ' · back-up' : ''} · by role</span></div></div>)}
        {a.added.map((p) => (
          <div key={p.id} className="lib-row"><div className="lib-appr two">
            <span className="lib-row-t"><b>{p.name}</b><span className="muted tiny">brought on board by {p.byName} · {new Date(p.at).toLocaleDateString()}</span></span>
            {perms.manageApprovers && <button type="button" className="btn btn-sm btn-danger-soft" onClick={() => (sure === p.id ? (setSure(''), go(removeApprover(p.id))) : setSure(p.id))}>{sure === p.id ? 'Tap again to remove' : 'Remove'}</button>}
          </div></div>
        ))}
      </div>
      {perms.manageApprovers ? (
        <div className="chip-row" style={{ marginTop: 10, flexWrap: 'nowrap' }}>
          <select className="input sm" aria-label="Member to bring on board" value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Bring someone on board…</option>{candidates.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          <button type="button" className="btn btn-sm btn-soft" disabled={!pick} onClick={() => { go(addApprover(pick)); setPick(''); }}>Add approver</button>
        </div>
      ) : <p className="muted tiny" style={{ marginTop: 8 }}>The Choir Master, Assistant Choir Master or an admin chooses Music Approvers. Every change is logged.</p>}
    </div>
  );
}
