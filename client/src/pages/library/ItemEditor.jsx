import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/ui/Icon';
import useAutosave from '../../hooks/useAutosave';
import { openFile } from '../../services/files';
import {
  ACCEPT, addFileTo, changeFile, claimItem, getItem, problem, removeFile, removeItem, sendPresence, settleDuplicate, sizeLabel, uploadToLibrary,
} from '../../services/library';

// One queue item's details (design page 9). Every field saves on its own; there is no Save button.
export const LABELS = {
  title: 'Title', type: 'Type', genre: 'Genre', composer: 'Composer', arranger: 'Arranger', firstLine: 'First line',
  languages: 'Language', choirKey: 'Choir key', originalKey: 'Original key', voicing: 'Voicing', instruments: 'Instruments',
  tempo: 'Tempo', bpm: 'BPM', tempoChanges: 'Tempo changes', character: 'Character', difficulty: 'Difficulty',
  massParts: 'Part of Mass', occasions: 'Occasion', seasons: 'Season / feast', themes: 'Theme',
  copyright: 'Copyright', source: 'Source', notes: 'Notes',
};
export const NEEDS = {
  title: 'Title', type: 'Type (song or instrumental)', genre: 'Genre', composer: 'Composer ("Traditional" or "Unknown" is fine)',
  languages: 'Language', choirKey: 'Choir key', massPartsOrOccasions: 'Part of Mass or occasion', seasons: 'Season or feast ("Any season" is fine)',
  voicingOrInstruments: 'Voicing (songs) or instruments (instrumentals)', score: 'At least one score',
};
const ago = (at) => { const s = Math.max(1, Math.round((Date.now() - new Date(at)) / 1000)); return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(at).toLocaleString(); };
const show = (v) => (Array.isArray(v) ? v.join(', ') : v === null || v === undefined || v === '' ? '(empty)' : String(v));

export default function ItemEditor({ uid, lists, me, onClose, onChanged, toast }) {
  const [item, setItem] = useState(null);
  const [failed, setFailed] = useState('');
  const [progress, setProgress] = useState(null);
  const [here, setHere] = useState([]);
  const [more, setMore] = useState(false);
  const [uploads, setUploads] = useState([]);
  const [link, setLink] = useState('');
  const [sure, setSure] = useState('');
  const focus = useRef('');

  const fresh = (it) => { setItem(it); setProgress({ done: it.done, total: it.total, missing: it.missing, status: it.status }); };
  useEffect(() => { getItem(uid).then(fresh).catch((e) => setFailed(problem(e, 'This item could not be opened'))); }, [uid]);
  const { values, set, conflicts, resolve, errors, state } = useAutosave(item, (r) => { setProgress({ done: r.done, total: r.total, missing: r.missing, status: r.status }); onChanged?.(); });

  // Who else has it open, every 15 seconds and whenever I move to another field
  const ping = useRef(() => {});
  ping.current = () => sendPresence(uid, { field: focus.current }).then(setHere).catch(() => {});
  useEffect(() => {
    ping.current();
    const t = setInterval(() => document.visibilityState === 'visible' && ping.current(), 15000);
    return () => { clearInterval(t); sendPresence(uid, { leave: true }).catch(() => {}); };
  }, [uid]);
  const onFocus = (f) => { if (focus.current !== f) { focus.current = f; ping.current(); } };

  const opts = (list) => [...new Set([...(lists?.lists?.[list] || []), ...(lists?.custom?.[list] || [])])];
  const typing = (f) => here.filter((p) => p.field === f).map((p) => p.name.split(' ')[0]);
  const isInstr = values.type === 'instrumental';

  const field = (f, kind, extra = {}) => {
    const req = extra.req;
    const v = values[f];
    const c = conflicts[f];
    const who = typing(f);
    const common = { onFocus: () => onFocus(f), 'aria-label': LABELS[f], disabled: state.locked };
    let input;
    if (kind === 'text') input = <input className="input" {...common} value={v ?? ''} maxLength={extra.n || 200} list={extra.list ? `dl-${extra.list}` : undefined} placeholder={extra.ph} onChange={(e) => set(f, e.target.value)} />;
    else if (kind === 'long') input = <textarea className="input" rows={3} {...common} value={v ?? ''} maxLength={2000} onChange={(e) => set(f, e.target.value)} />;
    else if (kind === 'num') input = <input className="input" type="number" min={20} max={320} {...common} value={v ?? ''} onChange={(e) => set(f, e.target.value === '' ? null : Number(e.target.value))} />;
    else if (kind === 'one') input = <input className="input" {...common} value={v ?? ''} list={`dl-${extra.list}`} placeholder="Choose, or type your own" onChange={(e) => set(f, e.target.value)} />;
    else if (kind === 'pick') input = <select className="input" {...common} value={v ?? ''} onChange={(e) => set(f, e.target.value, { now: true })}><option value="">—</option>{extra.of.map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}</select>;
    else if (kind === 'many') input = <Many value={v || []} options={opts(extra.list)} common={common} onChange={(nv) => set(f, nv, { now: true })} />;
    return (
      <div className={`field lib-f ${extra.wide ? 'wide' : ''}`} key={f}>
        <label className="label">{LABELS[f]}{req ? ' *' : ''}{who.length > 0 && <span className="lib-typing"> · {who.join(', ')} typing…</span>}</label>
        {input}
        {c && (
          <div className="lib-conflict" role="alert">
            <b>{c.byName}</b> changed this {c.at ? ago(c.at) : 'just now'} to “{show(c.value)}”.
            <span className="chip-row" style={{ marginTop: 6 }}>
              <button type="button" className="btn btn-sm btn-soft" onClick={() => resolve(f, 'theirs')}>Keep theirs</button>
              <button type="button" className="btn btn-sm btn-pri" onClick={() => resolve(f, 'mine')}>Use mine</button>
            </span>
          </div>
        )}
        {errors[f] && <div className="lib-err">{errors[f]}</div>}
      </div>
    );
  };

  const upload = async (files) => {
    for (const file of files) {
      const key = `${file.name}-${Date.now()}`;
      const upd = (x) => setUploads((u) => u.map((y) => (y.key === key ? { ...y, ...x } : y)));
      setUploads((u) => [...u, { key, name: file.name, sent: 0, total: file.size, phase: 'uploading' }]);
      try {
        const up = await uploadToLibrary(file, { onState: (s) => upd({ ...(s.sent !== undefined ? { sent: s.sent } : {}), phase: s.phase }) });
        fresh(await addFileTo(uid, { upload: up }, { onWait: (p) => upd({ phase: p }) }));
        setUploads((u) => u.filter((y) => y.key !== key));
        onChanged?.();
      } catch (e) { upd({ phase: 'failed', msg: problem(e) }); }
    }
  };
  const act = (fn, ok) => fn().then((it) => { if (it) fresh(it); if (ok) toast(ok); onChanged?.(); }).catch((e) => toast(problem(e), 'err'));

  if (failed) return <div className="lib-editor"><p className="muted">{failed}</p><button type="button" className="btn btn-soft" onClick={onClose}>Back to the queue</button></div>;
  if (!item) return <div className="lib-editor"><p className="muted small">Opening…</p></div>;
  const p = progress || item;
  const saving = state.locked ? 'Locked while the approvers review it'
    : Object.keys(conflicts).length ? `${Object.keys(conflicts).length} change${Object.keys(conflicts).length > 1 ? 's need' : ' needs'} your choice`
      : state.offline && state.waiting ? `Offline: ${state.waiting} change${state.waiting > 1 ? 's' : ''} waiting`
        : state.saving || state.waiting ? 'Saving…' : state.savedAt ? `✓ All changes saved · ${state.savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '✓ Saved';
  const savingTone = /Offline|choice|Locked/.test(saving) ? 'warn' : /Saving/.test(saving) ? 'mut' : 'ok';

  return (
    <div className="lib-editor">
      {Object.keys(lists?.lists || {}).filter((k) => k !== 'parts').map((k) => <datalist key={k} id={`dl-${k}`}>{opts(k).map((o) => <option key={o} value={o} />)}</datalist>)}
      <div className="lib-ed-head">
        <div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}><Icon name="back" size={14} /> Queue</button>
          <h3 style={{ margin: '6px 0 2px' }}><span className="lib-q">{item.ref}</span> {values.title || 'Untitled'}</h3>
          <div className="muted tiny">Uploaded by {item.createdByName} · {new Date(item.createdAt).toLocaleDateString()}</div>
        </div>
        <div className="lib-ed-status">
          {here.length > 0 && <span className="lib-presence">{here.map((h) => h.name.split(' ')[0]).join(', ')} {here.length > 1 ? 'are' : 'is'} also here</span>}
          <span className={`lib-saved ${savingTone}`} aria-live="polite">{saving}</span>
        </div>
      </div>

      {item.dup && (
        <div className="lib-banner">The same file is already in <b>{item.dup.ref}</b>. Merge this upload into it, or keep both?
          <span className="chip-row" style={{ marginTop: 6 }}>
            <button type="button" className="btn btn-sm btn-pri" onClick={() => settleDuplicate(uid, 'merge').then(() => { toast(`Merged into ${item.dup.ref}`); onChanged?.(); onClose(); }).catch((e) => toast(problem(e), 'err'))}>Merge into {item.dup.ref}</button>
            <button type="button" className="btn btn-sm btn-soft" onClick={() => act(() => settleDuplicate(uid, 'keep').then((d) => d.item), 'Both kept')}>Keep both</button>
          </span>
        </div>
      )}

      <div className="lib-ed-grid">
        <div>
          <div className="lib-fields">
            {field('title', 'text', { req: true, wide: true })}
            {field('type', 'pick', { req: true, of: [['song', 'Song (CHR)'], ['instrumental', 'Instrumental (INS)']] })}
            {field('genre', 'one', { req: true, list: 'genre' })}
            {field('composer', 'text', { req: true, n: 120, ph: 'or "Traditional" / "Unknown"' })}
            {field('languages', 'many', { req: true, list: 'languages' })}
            {field('choirKey', 'one', { req: true, list: 'keys' })}
            {isInstr ? field('instruments', 'many', { req: true, list: 'instruments' }) : field('voicing', 'one', { req: true, list: 'voicing' })}
            {field('massParts', 'many', { req: !(values.occasions || []).length, list: 'massParts', wide: true })}
            {field('occasions', 'many', { req: !(values.massParts || []).length, list: 'occasions', wide: true })}
            {field('seasons', 'many', { req: true, list: 'seasons', wide: true })}
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMore((m) => !m)} aria-expanded={more}>{more ? '▾' : '▸'} More: arranger, first line, original key, tempo, character, {isInstr ? 'voicing' : 'instruments'}, theme, difficulty, copyright, notes</button>
          {more && (
            <div className="lib-fields">
              {field('arranger', 'text', { n: 120 })}
              {field('firstLine', 'text', { n: 300, wide: true })}
              {field('originalKey', 'one', { list: 'keys' })}
              {field('tempo', 'one', { list: 'tempo' })}
              {field('bpm', 'num')}
              {field('tempoChanges', 'text', { list: 'tempoChanges', ph: 'e.g. Ritardando, last verse' })}
              {field('character', 'many', { list: 'character' })}
              {isInstr ? field('voicing', 'one', { list: 'voicing' }) : field('instruments', 'many', { list: 'instruments' })}
              {field('themes', 'many', { list: 'themes', wide: true })}
              {field('difficulty', 'pick', { of: (lists?.lists?.difficulty || []).map((d) => [d, d]) })}
              {field('copyright', 'one', { list: 'copyright' })}
              {field('source', 'text', { n: 300, ph: 'Hymnal, publisher or website' })}
              {field('notes', 'long', { wide: true })}
            </div>
          )}
        </div>

        <aside>
          <div className="card lib-check">
            <div className="lib-side-h">Ready for approval? {p.done} of {p.total}</div>
            <div className="progress slim" style={{ margin: '6px 0 10px' }}><div style={{ width: `${(100 * p.done) / p.total}%` }} /></div>
            {(lists?.required || Object.keys(NEEDS)).map((k) => {
              const ok = !(p.missing || []).includes(k);
              return <div key={k} className={`lib-chk ${ok ? 'y' : 'n'}`}><i>{ok ? '✓' : '!'}</i>{NEEDS[k] || k}</div>;
            })}
            <button type="button" className="btn btn-soft" disabled style={{ width: '100%', marginTop: 10 }} title="Approvals arrive in the next update">Send for approval</button>
            <div className="muted tiny" style={{ marginTop: 6 }}>{p.status === 'ready' ? 'Ready to send. Sending for approval arrives in the next update.' : 'Everything is saved as you go: come back any time.'}</div>
          </div>

          <div className="card lib-files">
            <div className="lib-side-h">Files ({item.files.length})</div>
            {item.files.map((f) => (
              <div key={f.fid} className="lib-file">
                <div className="lib-file-top">
                  <button type="button" className="lib-file-name" onClick={() => (f.link ? window.open(f.link, '_blank', 'noopener') : openFile(f.id, f.name).catch((e) => toast(problem(e), 'err')))} title="Open">
                    <Icon name={f.link ? 'play' : /^audio|^video/.test(f.mime) ? 'music' : 'file'} size={14} /> {f.name}
                  </button>
                  <button type="button" className="icon-btn" aria-label={`Remove ${f.name}`} onClick={() => (sure === f.fid ? (setSure(''), act(() => removeFile(uid, f.fid), 'File removed (kept 30 days in case it was a mistake)')) : setSure(f.fid))}>{sure === f.fid ? 'Remove?' : <Icon name="trash" size={13} />}</button>
                </div>
                <div className="lib-file-meta">
                  <select className="input sm" aria-label="Kind of file" value={f.kind} onChange={(e) => act(() => changeFile(uid, f.fid, { kind: e.target.value }))}>{(lists?.lists?.fileKinds || [f.kind]).map((k) => <option key={k}>{k}</option>)}</select>
                  <input className="input sm" aria-label="Part" list="dl-parts" defaultValue={f.part} onBlur={(e) => e.target.value.trim() && e.target.value !== f.part && act(() => changeFile(uid, f.fid, { part: e.target.value }))} />
                  <span className="muted tiny">v{f.version}{f.size ? ` · ${sizeLabel(f.size)}` : ''}</span>
                </div>
              </div>
            ))}
            {uploads.map((u) => (
              <div key={u.key} className="lib-file">
                <div className="small">{u.name}</div>
                {u.phase === 'failed' ? <div className="lib-err">{u.msg}</div> : (
                  <div className="tiny muted"><span className="progress slim" style={{ display: 'inline-block', width: 90, verticalAlign: 'middle' }}><span style={{ display: 'block', height: '100%', background: 'var(--gold2)', width: `${(100 * u.sent) / u.total}%` }} /></span> {u.phase === 'offline' ? 'Paused: waiting for the connection' : u.phase === 'retrying' ? 'Trying again…' : `${Math.round((100 * u.sent) / u.total)}%`}</div>
                )}
              </div>
            ))}
            <label className="upload-drop" style={{ marginTop: 8 }}>
              <Icon name="upload" size={18} /><span className="small"><b>Add a score, part or recording</b><br /><span className="muted tiny">Several at once · up to 100 MB each</span></span>
              <input type="file" hidden multiple accept={ACCEPT} onChange={(e) => { upload([...e.target.files]); e.target.value = ''; }} />
            </label>
            <div className="chip-row" style={{ marginTop: 8, flexWrap: 'nowrap' }}>
              <input className="input sm" placeholder="…or paste a recording link (https://)" value={link} onChange={(e) => setLink(e.target.value)} />
              <button type="button" className="btn btn-sm btn-soft" disabled={!link.trim()} onClick={() => act(() => addFileTo(uid, { link: { url: link.trim() } }).then((it) => { setLink(''); return it; }), 'Link added')}>Add</button>
            </div>
            <datalist id="dl-parts">{opts('parts').map((o) => <option key={o} value={o} />)}</datalist>
          </div>

          <div className="card lib-side-actions">
            {item.claim?.active && !item.claim.mine ? <div className="small">{item.claim.name} is working on this. You can still help.</div> : null}
            <div className="chip-row">
              {item.claim?.mine && item.claim.active
                ? <button type="button" className="btn btn-sm btn-soft" onClick={() => act(() => claimItem(uid, false), 'Released')}>Release my claim</button>
                : <button type="button" className="btn btn-sm btn-soft" onClick={() => act(() => claimItem(uid, true), "Claimed: others can see you're on it")}>Claim: I'm working on this</button>}
              <button type="button" className="btn btn-sm btn-danger-soft" onClick={() => (sure === 'item' ? removeItem(uid).then(() => { toast(`${item.ref} taken out of the queue`); onChanged?.(); onClose(); }).catch((e) => toast(problem(e), 'err')) : setSure('item'))}>{sure === 'item' ? 'Tap again to remove' : 'Remove from queue'}</button>
            </div>
          </div>

          {item.history?.length > 0 && (
            <details className="card lib-history"><summary className="lib-side-h">History</summary>
              {item.history.map((h, i) => <div key={i} className="tiny"><b>{h.ev}</b>{h.detail ? `: ${h.detail}` : ''} <span className="muted">· {h.byName} · {new Date(h.at).toLocaleString()}</span></div>)}
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}

// Several choices from a list, plus anything typed ("+ Other: type your own")
function Many({ value, options, onChange, common }) {
  const [t, setT] = useState('');
  const has = useMemo(() => new Set(value.map((x) => x.toLowerCase())), [value]);
  const add = (raw) => { const v = raw.trim().replace(/\s+/g, ' ').slice(0, 60); if (v && !has.has(v.toLowerCase())) onChange([...value, v]); setT(''); };
  const listId = common['aria-label'] && `dl-${{ 'Part of Mass': 'massParts', Occasion: 'occasions', 'Season / feast': 'seasons', Theme: 'themes', Language: 'languages', Instruments: 'instruments', Character: 'character' }[common['aria-label']]}`;
  return (
    <div className="lib-many">
      {value.map((v) => <span key={v} className="chip sm on">{v}<button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} disabled={common.disabled}>×</button></span>)}
      <input className="input sm" {...common} list={listId} value={t} placeholder={value.length ? '+ add' : 'Choose, or type your own'}
        onChange={(e) => { const v = e.target.value; if (options.includes(v)) add(v); else setT(v); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(t); } }}
        onBlur={() => t.trim() && add(t)} />
    </div>
  );
}
