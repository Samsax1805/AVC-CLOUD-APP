import React, { useEffect, useRef, useState } from 'react';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import { openFile } from '../../services/files';
import { catalogue, catalogueSong, problem, sizeLabel } from '../../services/library';

// The catalogue every member sees (design page 6): published music with its CHR / INS number, and urgent
// music marked "Urgent · not yet reviewed". Cards carry only the essentials; the song page has the rest.
const VOICES = ['Soprano', 'Alto', 'Tenor', 'Bass'];
const LABELS = {
  composer: 'Composer', arranger: 'Arranger', firstLine: 'First line', choirKey: 'Key', originalKey: 'Original key', tempo: 'Tempo', bpm: 'BPM',
  tempoChanges: 'Tempo changes', character: 'Character', voicing: 'Voicing', instruments: 'Instruments', languages: 'Language',
  massParts: 'Part of Mass', occasions: 'Occasion', seasons: 'Season / feast', themes: 'Theme', difficulty: 'Difficulty', copyright: 'Copyright', source: 'Source', notes: 'Notes',
};
const show = (v) => (Array.isArray(v) ? v.join(', ') : String(v));

export default function Catalogue({ me, toast }) {
  const [type, setType] = useState('song');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('code');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(() => catalogue({ type, q: q.trim() || undefined, sort, page }).then((d) => n === seq.current && setData(d)).catch(() => n === seq.current && setData({ items: [], total: 0, failed: true })), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [type, q, sort, page]);

  if (data && !data.total && !q && type === 'song' && !data.failed) return null; // nothing published yet: the library below shows as before
  return (
    <div className="card lib-cat">
      <div className="lib-list-h">
        <div className="lib-side-h">Catalogue <span className="muted small">· approved music with its number</span></div>
        <div className="chip-row">
          <button type="button" className={`chip sm ${type === 'song' ? 'on' : ''}`} onClick={() => { setType('song'); setPage(1); }}>Songs (CHR)</button>
          <button type="button" className={`chip sm ${type === 'instrumental' ? 'on' : ''}`} onClick={() => { setType('instrumental'); setPage(1); }}>Instrumental (INS)</button>
        </div>
      </div>
      <div className="toolbar" style={{ margin: '10px 0', gap: 8 }}>
        <div className="search-box" style={{ flex: 1 }}><Icon name="search" size={14} /><input aria-label="Search the catalogue" placeholder="Search title, number, composer, first line or language…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <select className="input sm" aria-label="Sort the catalogue" style={{ width: 'auto' }} value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}><option value="code">By number</option><option value="title">By title</option><option value="newest">Newest</option></select>
      </div>
      {data?.failed && <p className="muted small">The catalogue could not be loaded. Check your connection.</p>}
      {data && !data.items.length && !data.failed && <p className="muted small">Nothing matches.</p>}
      <div className="lib-cards">
        {data?.items.map((s) => (
          <button type="button" key={s.uid} className={`lib-card ${s.status === 'urgent' ? 'urgent' : ''}`} onClick={() => setOpen(s.uid)}>
            <span className="lib-card-top"><span className={s.code ? 'lib-code' : 'lib-q'}>{s.code || s.ref}</span><span className={`lib-pill ${s.status === 'urgent' ? 'lib-st-urgent' : 'lib-st-pub'}`}>{s.status === 'urgent' ? 'Urgent · not yet reviewed' : 'Published'}</span></span>
            <span className="lib-card-t">{s.title}</span>
            <span className="muted tiny">{s.summary || ' '}</span>
            <span className="lib-card-bot"><span className="lib-dots">{VOICES.map((v) => <i key={v} className={s.parts.includes(v) ? 'on' : ''} title={v}>{v[0]}</i>)}</span><span className="muted tiny">{s.files} file{s.files === 1 ? '' : 's'} ▸</span></span>
          </button>
        ))}
      </div>
      {data?.pages > 1 && (
        <div className="chip-row" style={{ justifyContent: 'center', marginTop: 10 }}>
          <button type="button" className="btn btn-sm btn-soft" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="small muted">Page {data.page} of {data.pages}</span>
          <button type="button" className="btn btn-sm btn-soft" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
      {open && <SongPage uid={open} me={me} toast={toast} onClose={() => setOpen(null)} />}
    </div>
  );
}

// One song (design page 7): my own voice part first, then every other file; details and copyright for everyone
function SongPage({ uid, me, toast, onClose }) {
  const [s, setS] = useState(null);
  const [failed, setFailed] = useState('');
  useEffect(() => { catalogueSong(uid).then(setS).catch((e) => setFailed(problem(e))); }, [uid]);
  const mine = VOICES.find((v) => String(me?.voice || me?.section || '').toLowerCase().startsWith(v.toLowerCase()));
  const files = s ? [...s.files].sort((a, b) => (b.part.startsWith(mine || '~') ? 1 : 0) - (a.part.startsWith(mine || '~') ? 1 : 0)) : [];
  const open = (f) => (f.link ? window.open(f.link, '_blank', 'noopener') : openFile(f.id, f.name).catch((e) => toast(problem(e), 'err')));
  return (
    <Modal open onClose={onClose} title={s ? (s.code || s.ref) : 'Song'} wide>
      {failed && <p className="muted">{failed}</p>}
      {!s && !failed && <p className="muted small">Opening…</p>}
      {s && (
        <div className="lib-song">
          <h3 style={{ margin: '0 0 4px' }}>{s.title}</h3>
          <div className="muted small">{[s.d.genre, s.d.choirKey, ...(s.d.massParts || []).slice(0, 1), s.d.voicing].filter(Boolean).join(' · ')}</div>
          {s.urgent && <div className="lib-banner warn" style={{ marginTop: 10 }}>Published urgently ({s.urgent.reason}). Not yet reviewed: its details and approval are still to come.</div>}
          <div className="lib-side-h" style={{ marginTop: 14 }}>{mine ? `Files · your part (${mine}) first` : 'Files'}</div>
          <div className="lib-song-files">
            {files.map((f) => (
              <div key={f.fid} className={`lib-song-file ${mine && f.part.startsWith(mine) ? 'mine' : ''}`}>
                <span><Icon name={f.link ? 'play' : /^audio|^video/.test(f.mime) ? 'music' : 'file'} size={14} /> <b>{f.kind}</b> · {f.part}</span>
                <span className="muted tiny">{f.version > 1 ? `v${f.version} · ` : ''}{f.size ? sizeLabel(f.size) : 'link'}</span>
                <button type="button" className="btn btn-sm btn-soft" onClick={() => open(f)}>{f.link ? 'Open ↗' : 'Open / download'}</button>
              </div>
            ))}
            {!files.length && <p className="muted small">No files yet.</p>}
          </div>
          <div className="lib-side-h" style={{ marginTop: 14 }}>Details</div>
          <dl className="lib-kv">{Object.entries(LABELS).filter(([k]) => s.d[k] !== undefined && s.d[k] !== null && s.d[k] !== '' && !(Array.isArray(s.d[k]) && !s.d[k].length)).map(([k, l]) => <React.Fragment key={k}><dt>{l}</dt><dd>{show(s.d[k])}</dd></React.Fragment>)}</dl>
          {s.approved && <div className="lib-sealed">✓ Approved by {s.approved.byName}{s.approved.self ? ' (self-approved)' : ''} · {new Date(s.approved.at).toLocaleDateString()}{s.approved.verified ? ' · seal verified' : ''}</div>}
        </div>
      )}
    </Modal>
  );
}
