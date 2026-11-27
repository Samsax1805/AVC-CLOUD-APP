import React, { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal';
import { answerRequest, catalogue, problem, requestSong, songRequests } from '../../services/library';

// "Request a song": any member asks for music the library doesn't have; the Custodian (or the Choir Master
// when there is no Custodian) is told in Messages and answers here.
const STATUS = { open: ['Waiting', 'lib-st-await'], found: ['In the library', 'lib-st-pub'], declined: ['Not possible', 'lib-st-sent'], withdrawn: ['Withdrawn', ''] };
const day = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());

// The member's side: a short form and their own requests
export function RequestSongModal({ toast, onClose, onOpenSong }) {
  const [form, setForm] = useState({ title: '', details: '', neededBy: '' });
  const [mine, setMine] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => songRequests().then((d) => setMine(d.requests.filter((r) => r.mine))).catch(() => setMine([]));
  useEffect(() => { load(); }, []);
  const send = async () => {
    setBusy(true);
    try { await requestSong({ ...form, title: form.title.trim() }); toast('Request sent to the Custodian'); setForm({ title: '', details: '', neededBy: '' }); load(); } catch (e) { toast(problem(e), 'err'); } finally { setBusy(false); }
  };
  const withdraw = (r) => answerRequest(r.id, { status: 'withdrawn' }).then(load).catch((e) => toast(problem(e), 'err'));
  return (
    <Modal open onClose={onClose} title="Request a song">
      <p className="muted small" style={{ marginTop: 0 }}>Can't find a song in the library? Ask for it here. The Custodian is told straight away, and you get the answer in Messages.</p>
      <label className="label" htmlFor="rq-title">Which song?</label>
      <input id="rq-title" className="input" maxLength={200} value={form.title} placeholder="Title, and the composer if you know it" onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <label className="label" htmlFor="rq-details">Anything that helps (optional)</label>
      <textarea id="rq-details" className="input" rows={2} maxLength={600} value={form.details} placeholder="e.g. the version we sang at Christmas; a link to a recording" onChange={(e) => setForm({ ...form, details: e.target.value })} />
      <label className="label" htmlFor="rq-by">Needed by (optional)</label>
      <input id="rq-by" type="date" className="input" min={today()} value={form.neededBy} onChange={(e) => setForm({ ...form, neededBy: e.target.value })} style={{ width: 'auto' }} />
      <div className="chip-row" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-pri" disabled={busy || form.title.trim().length < 2} onClick={send}>Send request</button>
      </div>
      {mine?.length > 0 && (
        <>
          <div className="lib-side-h" style={{ marginTop: 18 }}>Your requests</div>
          <div className="rq-list">
            {mine.map((r) => (
              <div key={r.id} className="rq-row">
                <div className="rq-main"><b>{r.title}</b><span className={`lib-pill ${STATUS[r.status]?.[1] || ''}`}>{STATUS[r.status]?.[0] || r.status}</span></div>
                <div className="muted tiny">Asked {day(r.at)}{r.neededBy ? ` · needed by ${day(r.neededBy)}` : ''}{r.doneByName && r.status !== 'withdrawn' ? ` · answered by ${r.doneByName}` : ''}</div>
                {r.reply && <div className="small rq-reply">{r.reply}</div>}
                <div className="chip-row" style={{ marginTop: 4 }}>
                  {r.status === 'found' && r.song && onOpenSong && <button type="button" className="btn btn-sm btn-soft" onClick={() => onOpenSong(r.song)}>Open the song</button>}
                  {r.status === 'open' && <button type="button" className="btn btn-sm btn-ghost" onClick={() => withdraw(r)}>Withdraw</button>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

// The music team's side (a tab in Music & Files): every request, answer with "In the library" or "Not possible"
export default function SongRequests({ toast }) {
  const [data, setData] = useState(null);
  const [act, setAct] = useState(null); // { id, kind: 'found'|'declined', reply, q, pick, results }
  const [busy, setBusy] = useState(false);
  const load = () => songRequests().then(setData).catch(() => setData({ requests: [] }));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (act?.kind !== 'found' || !act.q.trim()) return undefined;
    const t = setTimeout(() => catalogue({ q: act.q.trim() }).then((d) => setAct((a) => (a ? { ...a, results: d.items.slice(0, 6) } : a))).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [act?.kind, act?.q]);
  const answer = async (r) => {
    setBusy(true);
    try { await answerRequest(r.id, { status: act.kind, reply: act.reply.trim(), song: act.pick?.uid }); toast(act.kind === 'found' ? `${r.byName.split(' ')[0]} has been told it's in the library` : `${r.byName.split(' ')[0]} has been told`); setAct(null); load(); } catch (e) { toast(problem(e), 'err'); } finally { setBusy(false); }
  };
  const reopen = (r) => answerRequest(r.id, { status: 'open' }).then(load).catch((e) => toast(problem(e), 'err'));
  const open = data?.requests.filter((r) => r.status === 'open') || [];
  const done = data?.requests.filter((r) => r.status !== 'open') || [];
  return (
    <div className="stack">
      <div className="card">
        <div className="lib-side-h">Song requests <span className="muted small">· {data ? open.length : '…'} waiting</span></div>
        <p className="muted tiny" style={{ margin: '2px 0 8px' }}>Members ask here for music the library doesn't have. Upload it through the Upload queue, then mark the request "In the library" so they are told.</p>
        {data && !open.length && <p className="muted small">No requests are waiting.</p>}
        <div className="rq-list">
          {open.map((r) => (
            <div key={r.id} className="rq-row">
              <div className="rq-main"><b>{r.title}</b>{r.neededBy && <span className={`lib-pill ${r.neededBy <= today() ? 'lib-st-urgent' : 'lib-st-await'}`}>Needed by {day(r.neededBy)}</span>}</div>
              <div className="muted tiny">From {r.byName} · {day(r.at)}</div>
              {r.details && <div className="small rq-reply">{r.details}</div>}
              {act?.id === r.id ? (
                <div className="lib-act">
                  {act.kind === 'found' && (
                    <>
                      <label className="label" style={{ marginTop: 0 }}>Which song in the library? (optional)</label>
                      <input className="input sm" placeholder="Search the catalogue…" value={act.q} onChange={(e) => setAct({ ...act, q: e.target.value, pick: null })} />
                      {act.pick ? <div className="small" style={{ marginTop: 6 }}>✓ <b>{act.pick.code || act.pick.ref}</b> {act.pick.title} <button type="button" className="as-link" onClick={() => setAct({ ...act, pick: null })}>change</button></div>
                        : act.results?.length > 0 && <div className="chip-row" style={{ marginTop: 6 }}>{act.results.map((s) => <button type="button" key={s.uid} className="chip sm" onClick={() => setAct({ ...act, pick: s })}>{s.code || s.ref} · {s.title}</button>)}</div>}
                    </>
                  )}
                  <label className="label">{act.kind === 'found' ? 'Note to them (optional)' : 'Why not? (optional)'}</label>
                  <input className="input sm" maxLength={400} value={act.reply} placeholder={act.kind === 'found' ? 'e.g. The alto part is on page 2' : 'e.g. We could not find a copy'} onChange={(e) => setAct({ ...act, reply: e.target.value })} />
                  <div className="chip-row" style={{ marginTop: 8 }}>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAct(null)}>Cancel</button>
                    <button type="button" className={`btn btn-sm ${act.kind === 'found' ? 'btn-pri' : 'btn-danger-soft'}`} disabled={busy} onClick={() => answer(r)}>{act.kind === 'found' ? 'Mark as in the library' : 'Mark as not possible'}</button>
                  </div>
                </div>
              ) : (
                <div className="chip-row" style={{ marginTop: 6 }}>
                  <button type="button" className="btn btn-sm btn-pri" onClick={() => setAct({ id: r.id, kind: 'found', reply: '', q: r.title, pick: null, results: [] })}>In the library</button>
                  <button type="button" className="btn btn-sm btn-danger-soft" onClick={() => setAct({ id: r.id, kind: 'declined', reply: '', q: '' })}>Not possible</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {done.length > 0 && (
        <div className="card">
          <div className="lib-side-h">Answered</div>
          <div className="rq-list">
            {done.map((r) => (
              <div key={r.id} className="rq-row">
                <div className="rq-main"><b>{r.title}</b><span className={`lib-pill ${STATUS[r.status]?.[1] || ''}`}>{STATUS[r.status]?.[0] || r.status}</span></div>
                <div className="muted tiny">From {r.byName} · {day(r.at)}{r.doneByName ? ` · ${r.status === 'withdrawn' ? 'withdrawn' : `answered by ${r.doneByName}`} ${day(r.doneAt)}` : ''}</div>
                {r.reply && <div className="small rq-reply">{r.reply}</div>}
                {r.status !== 'withdrawn' && <button type="button" className="as-link small" onClick={() => reopen(r)}>Reopen</button>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
