import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import Icon from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import Thumb from './Thumb';
import { openFile } from '../../services/files';
import { catalogue, catalogueFilters, catalogueSong, problem, sizeLabel } from '../../services/library';
import { RequestSongModal } from './SongRequests';

const ScoreViewer = lazy(() => import('./ScoreViewer')); // the PDF reader loads only when a score is opened

// The catalogue every member sees (design page 6): published music with its CHR / INS number, and urgent
// music marked "Urgent · not yet reviewed". Cards carry only the essentials; the song page has the rest.
const VOICES = ['Soprano', 'Alto', 'Tenor', 'Bass'];
const LABELS = {
  composer: 'Composer', arranger: 'Arranger', firstLine: 'First line', choirKey: 'Key', originalKey: 'Original key', tempo: 'Tempo', bpm: 'BPM',
  tempoChanges: 'Tempo changes', character: 'Character', voicing: 'Voicing', instruments: 'Instruments', languages: 'Language',
  massParts: 'Part of Mass', occasions: 'Occasion', seasons: 'Season / feast', themes: 'Theme', difficulty: 'Difficulty', copyright: 'Copyright', source: 'Source', notes: 'Notes',
};
const show = (v) => (Array.isArray(v) ? v.join(', ') : String(v));

const NO_FILTERS = { massPart: '', season: '', voicing: '' };
const SHORT = (v) => v.replace(/\s*\(.*\)$/, '').replace(/ \/ .*$/, ''); // "Entrance / Processional" → "Entrance"

export default function Catalogue({ me, toast, canDraw = false }) {
  const [type, setType] = useState('song');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('code');
  const [page, setPage] = useState(1);
  const [f, setF] = useState(NO_FILTERS);
  const [data, setData] = useState(null);
  const [facets, setFacets] = useState(null);
  const [open, setOpen] = useState(null);
  const [asking, setAsking] = useState(false);
  const seq = useRef(0);
  const fseq = useRef(0);
  const filters = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  const fkey = JSON.stringify(filters);
  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(() => catalogue({ type, q: q.trim() || undefined, sort, page, ...filters }).then((d) => n === seq.current && setData(d)).catch(() => n === seq.current && setData({ items: [], total: 0, failed: true })), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [type, q, sort, page, fkey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const n = ++fseq.current;
    const t = setTimeout(() => catalogueFilters({ type, q: q.trim() || undefined, ...filters }).then((d) => n === fseq.current && setFacets(d)).catch(() => {}), q ? 350 : 0);
    return () => clearTimeout(t);
  }, [type, q, fkey]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (k, v) => { setF((x) => ({ ...x, [k]: v })); setPage(1); };
  const anyFilter = Object.keys(filters).length > 0;
  const choices = (k) => { const list = facets?.[k] || []; return f[k] && !list.some((c) => c.value === f[k]) ? [{ value: f[k], n: 0 }, ...list] : list; };

  const empty = data && !data.total && !q && type === 'song' && !data.failed && !anyFilter;
  const ask = asking && <RequestSongModal toast={toast} onClose={() => setAsking(false)} onOpenSong={(uid) => { setAsking(false); setOpen(uid); }} />;
  if (empty) {
    // nothing published yet: the library below shows as before, and members can still ask for a song
    return (
      <div className="card lib-cat-empty">
        <span className="small muted">Approved music with its number will appear here. Can't find a song?</span>
        <button type="button" className="btn btn-sm btn-soft" onClick={() => setAsking(true)}>Request a song</button>
        {ask}
      </div>
    );
  }
  return (
    <div className="card lib-cat">
      <div className="lib-list-h">
        <div className="lib-side-h">Catalogue <span className="muted small">· approved music with its number</span></div>
        <div className="chip-row">
          <button type="button" className={`chip sm ${type === 'song' ? 'on' : ''}`} onClick={() => { setType('song'); setPage(1); }}>Songs (CHR)</button>
          <button type="button" className={`chip sm ${type === 'instrumental' ? 'on' : ''}`} onClick={() => { setType('instrumental'); setPage(1); }}>Instrumental (INS)</button>
          <button type="button" className="btn btn-sm btn-soft" onClick={() => setAsking(true)}>Request a song</button>
        </div>
      </div>
      <div className="toolbar" style={{ margin: '10px 0', gap: 8 }}>
        <div className="search-box" style={{ flex: 1 }}><Icon name="search" size={14} /><input aria-label="Search the catalogue" placeholder="Search title, number, composer or any words of the song…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <select className="input sm" aria-label="Sort the catalogue" style={{ width: 'auto' }} value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}><option value="code">By number</option><option value="title">By title</option><option value="newest">Newest</option></select>
      </div>
      {/* Part of the Mass as tiles with counts, then season and voicing */}
      {(choices('massPart').length > 0 || f.massPart) && (
        <div className="lib-tiles" role="group" aria-label="Part of the Mass">
          <button type="button" className={`lib-tile ${!f.massPart ? 'on' : ''}`} onClick={() => pick('massPart', '')}><b>All</b></button>
          {choices('massPart').map((c) => <button type="button" key={c.value} className={`lib-tile ${f.massPart === c.value ? 'on' : ''}`} title={c.value} onClick={() => pick('massPart', f.massPart === c.value ? '' : c.value)}><b>{SHORT(c.value)}</b><span>{c.n}</span></button>)}
        </div>
      )}
      <div className="chip-row lib-filters">
        <select className="input sm" aria-label="Season or feast" value={f.season} onChange={(e) => pick('season', e.target.value)}>
          <option value="">Any season</option>
          {choices('season').map((c) => <option key={c.value} value={c.value}>{c.value} ({c.n})</option>)}
        </select>
        <select className="input sm" aria-label="Voicing" value={f.voicing} onChange={(e) => pick('voicing', e.target.value)}>
          <option value="">Any voicing</option>
          {choices('voicing').map((c) => <option key={c.value} value={c.value}>{c.value} ({c.n})</option>)}
        </select>
        {anyFilter && <button type="button" className="as-link small" onClick={() => { setF(NO_FILTERS); setPage(1); }}>Clear filters</button>}
        {data && <span className="muted tiny lib-count">{data.total} {data.total === 1 ? 'piece' : 'pieces'}</span>}
      </div>
      {data?.failed && <p className="muted small">The catalogue could not be loaded. Check your connection.</p>}
      {data && !data.items.length && !data.failed && <p className="muted small">Nothing matches. <button type="button" className="as-link" onClick={() => setAsking(true)}>Request this song</button></p>}
      <div className="lib-cards">
        {data?.items.map((s) => (
          <button type="button" key={s.uid} className={`lib-card ${s.status === 'urgent' ? 'urgent' : ''}`} onClick={() => setOpen(s.uid)}>
            <Thumb uid={s.uid} has={s.preview} draw={s.draw} canDraw={canDraw} className="card-top" alt={`First page of ${s.title}`} />
            <span className="lib-card-top"><span className={s.code ? 'lib-code' : 'lib-q'}>{s.code || s.ref}</span><span className={`lib-pill ${s.status === 'urgent' ? 'lib-st-urgent' : 'lib-st-pub'}`}>{s.status === 'urgent' ? 'Urgent · not yet reviewed' : 'Published'}</span></span>
            <span className="lib-card-t">{s.title}</span>
            {s.lyric ? <span className="tiny lib-lyric">“{s.lyric}”</span> : <span className="muted tiny">{s.summary || ' '}</span>}
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
      {open && <SongPage uid={open} me={me} toast={toast} canDraw={canDraw} onOpen={setOpen} onClose={() => setOpen(null)} />}
      {ask}
    </div>
  );
}

// One song (design page 7): my own voice part first, then every other file; read a score here, print it;
// the words; details and copyright for everyone; and songs like it
const viewable = (f) => f.id && (f.mime === 'application/pdf' || /^image\//.test(f.mime || '') || /\.pdf$/i.test(f.name || ''));
function SongPage({ uid, me, toast, canDraw, onOpen, onClose }) {
  const [s, setS] = useState(null);
  const [failed, setFailed] = useState('');
  const [view, setView] = useState(null);
  const [words, setWords] = useState(false);
  useEffect(() => { setS(null); setFailed(''); setWords(false); catalogueSong(uid).then(setS).catch((e) => setFailed(problem(e))); }, [uid]);
  const mine = VOICES.find((v) => String(me?.voice || me?.section || '').toLowerCase().startsWith(v.toLowerCase()));
  const files = s ? [...s.files].sort((a, b) => (b.part.startsWith(mine || '~') ? 1 : 0) - (a.part.startsWith(mine || '~') ? 1 : 0)) : [];
  const open = (f) => (f.link ? window.open(f.link, '_blank', 'noopener') : openFile(f.id, f.name).catch((e) => toast(problem(e), 'err')));
  const lyrics = s?.d?.lyrics || '';
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
                <span className="chip-row lib-file-btns">
                  {viewable(f) && <button type="button" className="btn btn-sm btn-pri" onClick={() => setView(f)}><Icon name="eye" size={13} /> View</button>}
                  <button type="button" className="btn btn-sm btn-soft" onClick={() => open(f)}>{f.link ? 'Open ↗' : 'Open / download'}</button>
                </span>
              </div>
            ))}
            {!files.length && <p className="muted small">No files yet.</p>}
          </div>
          {lyrics && (
            <>
              <div className="lib-side-h" style={{ marginTop: 14 }}>Words</div>
              <div className={`lib-words ${words ? 'all' : ''}`}>{lyrics}</div>
              {lyrics.split('\n').length > 8 && <button type="button" className="as-link small" onClick={() => setWords((w) => !w)}>{words ? 'Show less' : 'Show all the words'}</button>}
            </>
          )}
          <div className="lib-side-h" style={{ marginTop: 14 }}>Details</div>
          <dl className="lib-kv">{Object.entries(LABELS).filter(([k]) => s.d[k] !== undefined && s.d[k] !== null && s.d[k] !== '' && !(Array.isArray(s.d[k]) && !s.d[k].length)).map(([k, l]) => <React.Fragment key={k}><dt>{l}</dt><dd>{show(s.d[k])}</dd></React.Fragment>)}</dl>
          {s.approved && <div className="lib-sealed">✓ Approved by {s.approved.byName}{s.approved.self ? ' (self-approved)' : ''} · {new Date(s.approved.at).toLocaleDateString()}{s.approved.verified ? ' · seal verified' : ''}</div>}
          {s.related?.length > 0 && (
            <>
              <div className="lib-side-h" style={{ marginTop: 16 }}>Related songs</div>
              <div className="lib-related">
                {s.related.map((r) => (
                  <button type="button" key={r.uid} className="lib-rel" onClick={() => onOpen(r.uid)}>
                    <Thumb uid={r.uid} has={r.preview} draw={r.draw} canDraw={canDraw} alt={`First page of ${r.title}`} />
                    <span className="lib-rel-t"><span className={r.code ? 'lib-code' : 'lib-q'}>{r.code || r.ref}</span><b>{r.title}</b><span className="muted tiny">{r.summary}</span></span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {view && <Suspense fallback={<div className="viewer"><p className="viewer-msg">Opening the score…</p></div>}><ScoreViewer file={view} title={s?.title} toast={toast} onClose={() => setView(null)} /></Suspense>}
    </Modal>
  );
}
