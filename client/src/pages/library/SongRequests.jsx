import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import { addRequestToLibrary, answerRequest, catalogue, problem, requestSong, similarSongs, sizeLabel, songRequests, uploadRequestScore } from '../../services/library';

const ScoreViewer = lazy(() => import('./ScoreViewer'));

// "Request a song": any member asks for music the library doesn't have, with the score and its details if they
// have them. The Custodian (or the Choir Master when there is no Custodian) is told in Messages. A request with a
// score can be added to the Upload queue already filled in; once approved and published, the member is told.
const STATUS = { open: ['Waiting', 'lib-st-await'], adding: ['Being added', 'lib-st-ready'], found: ['In the library', 'lib-st-pub'], declined: ['Not possible', 'lib-st-sent'], withdrawn: ['Withdrawn', ''] };
const day = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
const EMPTY = { title: '', details: '', neededBy: '', composer: '', massPart: '', season: '', voicing: '', language: '' };
const infoLine = (i = {}) => [i.composer, i.massPart, i.season, i.voicing, i.language].filter(Boolean).join(' · ');

// The member's side: a short form and their own requests
export function RequestSongModal({ toast, onClose, onOpenSong }) {
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [data, setData] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [sending, setSending] = useState(''); // '' or what is happening
  const [more, setMore] = useState(false);
  const pickRef = useRef(null);
  const load = () => songRequests().then(setData).catch(() => setData({ requests: [], lists: {} }));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = form.title.trim();
    if (t.length < 3) { setSimilar([]); return undefined; }
    const h = setTimeout(() => similarSongs(t).then(setSimilar).catch(() => {}), 350);
    return () => clearTimeout(h);
  }, [form.title]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const maxMb = data?.maxMb || 20;
  const choose = (f) => {
    if (!f) return;
    if (!/^(application\/pdf|image\/(jpeg|png|webp))$/.test(f.type) && !/\.pdf$/i.test(f.name)) { toast('Attach the score as a PDF or a picture', 'err'); return; }
    if (f.size > maxMb * 1048576) { toast(`The score can be up to ${maxMb} MB`, 'err'); return; }
    setFile(f);
  };
  const send = async () => {
    try {
      let upload;
      if (file) { setSending('Uploading the score… 0%'); upload = await uploadRequestScore(file, (p) => setSending(`Uploading the score… ${Math.min(99, Math.round(p * 100))}%`)); }
      setSending('Sending…');
      const { title, details, neededBy, ...info } = form;
      await requestSong({ title: title.trim(), details, neededBy, info, upload });
      toast('Request sent to the Custodian');
      setForm(EMPTY); setFile(null); setMore(false); load();
    } catch (e) { toast(problem(e), 'err'); } finally { setSending(''); }
  };
  const withdraw = (r) => answerRequest(r.id, { status: 'withdrawn' }).then(load).catch((e) => toast(problem(e), 'err'));
  const lists = data?.lists || {};
  const mine = data?.requests.filter((r) => r.mine) || [];
  return (
    <Modal open onClose={onClose} title="Request a song">
      <p className="muted small" style={{ marginTop: 0 }}>Can't find a song in the library? Ask for it here, and attach the score if you have it. The Custodian is told straight away; once it is approved and published, you are told in Messages.</p>
      <label className="label" htmlFor="rq-title">Which song?</label>
      <input id="rq-title" className="input" maxLength={200} value={form.title} placeholder="The song's title" onChange={set('title')} />
      {similar.length > 0 && (
        <div className="rq-similar">
          <b className="small">Already in the library?</b>
          {similar.map((s) => <div key={s.uid} className="rq-sim-row"><span className="small"><span className="lib-code">{s.code}</span> {s.title}</span>{onOpenSong && <button type="button" className="as-link small" onClick={() => onOpenSong(s.uid)}>Open</button>}</div>)}
          <span className="muted tiny">If it is one of these, there's no need to ask.</span>
        </div>
      )}
      <label className="label">The score (optional)</label>
      <div className={`rq-file ${file ? 'has' : ''}`}>
        {file ? <><Icon name="file" size={15} /><span className="small rq-file-n">{file.name}</span><span className="muted tiny">{sizeLabel(file.size)}</span><button type="button" className="as-link small" onClick={() => setFile(null)}>Remove</button></>
          : <button type="button" className="btn btn-sm btn-soft" onClick={() => pickRef.current?.click()}><Icon name="upload" size={13} /> Attach PDF or picture</button>}
        <input ref={pickRef} type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }} />
        {!file && <span className="muted tiny">Up to {maxMb} MB</span>}
      </div>
      <button type="button" className="as-link small" style={{ marginTop: 10 }} aria-expanded={more} onClick={() => setMore((m) => !m)}>{more ? '▾' : '▸'} Song details (optional): composer, part of Mass, season, voicing, language</button>
      {more && (
        <div className="rq-grid">
          <div><label className="label" htmlFor="rq-comp">Composer</label><input id="rq-comp" className="input" maxLength={120} value={form.composer} placeholder='or "Traditional"' onChange={set('composer')} /></div>
          <div><label className="label" htmlFor="rq-mass">Part of Mass</label><select id="rq-mass" className="input" value={form.massPart} onChange={set('massPart')}><option value="">—</option>{(lists.massParts || []).map((x) => <option key={x}>{x}</option>)}</select></div>
          <div><label className="label" htmlFor="rq-season">Season / feast</label><select id="rq-season" className="input" value={form.season} onChange={set('season')}><option value="">—</option>{(lists.seasons || []).map((x) => <option key={x}>{x}</option>)}</select></div>
          <div><label className="label" htmlFor="rq-voicing">Voicing</label><select id="rq-voicing" className="input" value={form.voicing} onChange={set('voicing')}><option value="">—</option>{(lists.voicing || []).map((x) => <option key={x}>{x}</option>)}</select></div>
          <div><label className="label" htmlFor="rq-lang">Language</label><select id="rq-lang" className="input" value={form.language} onChange={set('language')}><option value="">—</option>{(lists.languages || []).map((x) => <option key={x}>{x}</option>)}</select></div>
        </div>
      )}
      <label className="label" htmlFor="rq-details">Anything else that helps (optional)</label>
      <textarea id="rq-details" className="input" rows={2} maxLength={600} value={form.details} placeholder="e.g. the version we sang at Christmas; a link to a recording" onChange={set('details')} />
      <label className="label" htmlFor="rq-by">Needed by (optional)</label>
      <input id="rq-by" type="date" className="input" min={today()} value={form.neededBy} onChange={set('neededBy')} style={{ width: 'auto' }} />
      <div className="chip-row" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-pri" disabled={!!sending || form.title.trim().length < 2} onClick={send}>{sending || 'Send request'}</button>
      </div>
      {mine.length > 0 && (
        <>
          <div className="lib-side-h" style={{ marginTop: 18 }}>Your requests</div>
          <div className="rq-list">
            {mine.map((r) => (
              <div key={r.id} className="rq-row">
                <div className="rq-main"><b>{r.title}</b><span className={`lib-pill ${STATUS[r.status]?.[1] || ''}`}>{STATUS[r.status]?.[0] || r.status}</span></div>
                <div className="muted tiny">Asked {day(r.at)}{r.file ? ' · score attached' : ''}{r.neededBy ? ` · needed by ${day(r.neededBy)}` : ''}{r.doneByName && r.status !== 'withdrawn' ? ` · ${r.status === 'adding' ? 'being added by' : 'answered by'} ${r.doneByName}` : ''}</div>
                {r.status === 'adding' && <div className="small rq-reply">It is in the Upload queue as {r.itemRef}. You'll be told when it is approved and published.</div>}
                {r.reply && r.status !== 'adding' && <div className="small rq-reply">{r.reply}</div>}
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

// The music team's side (a tab in Music & Files): every request. One with a score can be added to the Upload
// queue already filled in; otherwise answer "In the library" or "Not possible".
export default function SongRequests({ toast, onOpenItem }) {
  const [data, setData] = useState(null);
  const [act, setAct] = useState(null); // { id, kind: 'found'|'declined', reply, q, pick, results }
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(null);
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
  const add = async (r) => {
    setBusy(true);
    try { const d = await addRequestToLibrary(r.id); toast(`Added to the Upload queue as ${d.item.ref}`); load(); } catch (e) { toast(problem(e), 'err'); } finally { setBusy(false); }
  };
  const reopen = (r) => answerRequest(r.id, { status: 'open' }).then(load).catch((e) => toast(problem(e), 'err'));
  const open = data?.requests.filter((r) => r.status === 'open' || r.status === 'adding') || [];
  const done = data?.requests.filter((r) => r.status !== 'open' && r.status !== 'adding') || [];
  return (
    <div className="stack">
      <div className="card">
        <div className="lib-side-h">Song requests <span className="muted small">· {data ? open.filter((r) => r.status === 'open').length : '…'} waiting</span></div>
        <p className="muted tiny" style={{ margin: '2px 0 8px' }}>Members ask here for music the library doesn't have. If they attached the score, press "Add to library": it goes into the Upload queue already filled in, and once it is approved and published they are told. The Custodian can approve songs that came from a request.</p>
        {data && !open.length && <p className="muted small">No requests are waiting.</p>}
        <div className="rq-list">
          {open.map((r) => (
            <div key={r.id} className="rq-row">
              <div className="rq-main"><b>{r.title}</b>{r.status === 'adding' ? <span className="lib-pill lib-st-ready">In the queue · {r.itemRef}</span> : r.neededBy && <span className={`lib-pill ${r.neededBy <= today() ? 'lib-st-urgent' : 'lib-st-await'}`}>Needed by {day(r.neededBy)}</span>}</div>
              <div className="muted tiny">From {r.byName} · {day(r.at)}{infoLine(r.info) ? ` · ${infoLine(r.info)}` : ''}</div>
              {r.details && <div className="small rq-reply">{r.details}</div>}
              {r.file && (
                <div className="rq-file has" style={{ marginTop: 6 }}>
                  <Icon name="file" size={15} /><span className="small rq-file-n">{r.file.name}</span><span className="muted tiny">{sizeLabel(r.file.size)}</span>
                  <button type="button" className="btn btn-sm btn-soft" onClick={() => setView(r)}><Icon name="eye" size={13} /> View</button>
                </div>
              )}
              {r.matches?.length > 0 && r.status === 'open' && <div className="tiny rq-match">⚠ Possibly already in the library: {r.matches.map((m) => `${m.code} ${m.title}`).join(', ')}</div>}
              {r.status === 'adding' ? (
                <div className="chip-row" style={{ marginTop: 6 }}>
                  {onOpenItem && <button type="button" className="btn btn-sm btn-soft" onClick={() => onOpenItem(r.item)}>Open {r.itemRef} in the queue</button>}
                  <span className="muted tiny">The member is told when it is published.</span>
                </div>
              ) : act?.id === r.id ? (
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
                  {r.file && <button type="button" className="btn btn-sm btn-pri" disabled={busy} onClick={() => add(r)}><Icon name="plus" size={13} /> Add to library</button>}
                  <button type="button" className={`btn btn-sm ${r.file ? 'btn-soft' : 'btn-pri'}`} onClick={() => setAct({ id: r.id, kind: 'found', reply: '', q: r.title, pick: null, results: [] })}>Already in the library</button>
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
      {view && <Suspense fallback={null}><ScoreViewer file={{ id: view.file.id, name: view.file.name, mime: view.file.mime, kind: 'Attached score', part: `from ${view.byName}` }} title={view.title} toast={toast} onClose={() => setView(null)} /></Suspense>}
    </div>
  );
}
