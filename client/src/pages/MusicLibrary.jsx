import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { motion } from 'framer-motion';
import { TODAY, uid, shortDate, VOICE_PARTS, SONG_CATEGORIES, songCategories, ALL_PARTS, songParts, partsLabel } from '../utils/helpers';
import { PERMS } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import Pagination, { usePaged } from '../components/ui/Pagination';
import { uploadFile, deleteFile, makePreview, mediaDuration, openFile, MAX_UPLOAD_MB, sizeOf, previewFromStored } from '../services/files';
import { addRecord, changeRecord, removeRecord, saveError } from '../services/records';

const ACCEPT = 'audio/*,application/pdf,image/*,video/*';
// The upload queue is only downloaded by officers who open it
const LibraryQueue = lazy(() => import('./library/LibraryQueue'));
const Approvals = lazy(() => import('./library/Approvals'));
const Catalogue = lazy(() => import('./library/Catalogue'));
const SongRequests = lazy(() => import('./library/SongRequests'));

// A song's picture preview, fetched only when its card scrolls into view (kept by the browser for a day)
const previews = new Map();
function Preview({ song }) {
  const ref = useRef(null);
  const [src, setSrc] = useState(song.preview || previews.get(song.id) || '');
  useEffect(() => {
    if (src || !song.hasPreview || !ref.current) return undefined;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      api.get(`/records/songs/${song.id}/preview`, { responseType: 'blob' }).then(({ data }) => { const u = URL.createObjectURL(data); previews.set(song.id, u); setSrc(u); }).catch(() => {});
    }, { rootMargin: '200px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [song.id, song.hasPreview, src]);
  return src ? <img src={src} alt={`First page of ${song.title}`} /> : <span ref={ref}><Icon name="note" size={40} /></span>;
}
const formatOf = (type) => (type === 'application/pdf' ? 'PDF Score' : type.startsWith('image/') ? 'Image' : type.startsWith('video/') ? 'Video' : type.includes('mpeg') ? 'MP3' : 'Audio');

export default function MusicLibrary({ ctx }) {
  const { me, users, songs, setSongs, loadSongs, log, toast, playId, playProg, togglePlay } = ctx;
  const canEdit = PERMS.manageSongs(me);
  // What this person may do in the library (Music Approvers are a list, so the server says)
  const [lib, setLib] = useState({ staff: PERMS.libraryQueue(me), approve: false, manageApprovers: false });
  useEffect(() => { api.get('/library/me').then(({ data }) => setLib(data)).catch(() => {}); }, []);
  const canQueue = lib.staff;
  // ctx.musicTab is "queue-…" (New Upload), or "approvals-…" / "requests-…" (from the Help Centre)
  const wanted = ['approvals', 'requests'].find((t) => String(ctx.musicTab || '').startsWith(t)) || 'queue';
  const [tab, setTab] = useState(ctx.musicTab ? wanted : 'library');
  useEffect(() => { if (ctx.musicTab && canQueue) setTab(wanted); }, [ctx.musicTab, canQueue]); // eslint-disable-line react-hooks/exhaustive-deps
  const [openItem, setOpenItem] = useState(null); // a queue item to open (from Requests)
  const [songsFailed, setSongsFailed] = useState(false);
  useEffect(() => { loadSongs?.().catch(() => setSongsFailed(true)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Scores uploaded while page pictures were failing (22–27 Nov) have none: the officer's browser draws and saves them, one at a time
  const tried = useRef(new Set());
  useEffect(() => {
    if (!canEdit) return;
    const missing = songs.filter((s) => !s.catalogue && s.fileUrl && !s.preview && !s.hasPreview && !tried.current.has(s.id)
      && (s.mime === 'application/pdf' || /^image\//.test(s.mime || '') || /PDF|Image/.test(s.format || '')));
    if (!missing.length) return;
    missing.forEach((s) => tried.current.add(s.id));
    (async () => {
      for (const s of missing) {
        try {
          const pic = await previewFromStored(s.fileUrl, s.fileName, s.mime);
          if (!pic) continue;
          await changeRecord('songs', s.id, { preview: pic });
          setSongs((p) => p.map((x) => (x.id === s.id ? { ...x, preview: pic } : x)));
        } catch { /* left as it was; tried again next visit */ }
      }
    })();
  }, [songs, canEdit]); // eslint-disable-line react-hooks/exhaustive-deps
  const [q, setQ] = useState('');
  const [part, setPart] = useState('All');
  const [cat, setCat] = useState('All');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ title: '', part: ALL_PARTS, categories: [], format: 'MP3', fileName: '' });

  const [file, setFile] = useState(null); // { file, preview, secs }
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) return toast(`File is larger than ${MAX_UPLOAD_MB} MB`, 'err');
    setBusy(true);
    const [preview, secs] = await Promise.all([makePreview(f), /^(audio|video)\//.test(f.type) ? mediaDuration(f) : 0]);
    setFile({ file: f, preview, secs });
    setForm((x) => ({ ...x, fileName: f.name, format: formatOf(f.type), title: x.title || f.name.replace(/\.[^.]+$/, '') }));
    setBusy(false);
  };
  const save = async () => {
    if (!form.title.trim()) return toast('Enter a song title', 'err');
    if (modal.mode === 'new') {
      if (!file) return toast('Choose a file to upload', 'err');
      setBusy(true);
      try {
        const up = await uploadFile(file.file);
        const covers = ['#7c3aed', '#0284c7', '#e11d48', '#059669', '#f59e0b', '#4f46e5'];
        const secs = Math.round(file.secs || 0);
        const rec = await addRecord('songs', {
          title: form.title, part: form.part, format: form.format, size: sizeOf(up.size),
          duration: secs ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '', date: TODAY, categories: form.categories,
          cover: covers[Math.floor(Math.random() * covers.length)], fileUrl: up.id, fileName: up.name, mime: up.type, preview: file.preview || '',
        });
        setSongs((p) => [rec, ...p]);
        log('SONG_UPLOAD', `Uploaded "${form.title}"`); toast('Uploaded to the library');
      } catch (e) { return toast(saveError(e), 'err'); } finally { setBusy(false); }
    } else {
      try {
        const rec = await changeRecord('songs', modal.song.id, { title: form.title, part: form.part, categories: form.categories, format: form.format });
        setSongs((p) => p.map((s) => (s.id === rec.id ? rec : s)));
        log('SONG_EDIT', `Edited "${form.title}"`); toast('Song updated');
      } catch (e) { return toast(saveError(e), 'err'); }
    }
    setModal(null); setFile(null);
  };
  const del = (s) => removeRecord('songs', s.id).then(() => { deleteFile(s.fileUrl); setSongs((p) => p.filter((x) => x.id !== s.id)); log('SONG_DELETE', `Deleted "${s.title}"`); toast('Song deleted'); }).catch((e) => toast(saveError(e), 'err'));
  const isMedia = (s) => !s.fileUrl || /^(audio|video)\//.test(s.mime || '');
  const openCover = (s) => (isMedia(s) ? togglePlay('song-' + s.id, s.fileUrl) : openFile(s.fileUrl, s.fileName).catch((e) => toast(e.message, 'err')));
  // "All parts" switches every part on; any single part can then be switched off again
  const formParts = songParts(form);
  const togglePart = (p) => {
    const next = formParts.includes(p) ? formParts.filter((x) => x !== p) : [...formParts, p];
    if (!next.length) return toast('Choose at least one part', 'err');
    setForm((f) => ({ ...f, part: partsLabel(next) }));
  };
  const toggleCat = (c) => setForm((f) => ({ ...f, categories: f.categories.includes(c) ? f.categories.filter((x) => x !== c) : [...f.categories, c] }));
  // Search matches the song name or any of its categories
  const needle = q.trim().toLowerCase();
  // Catalogue music has its own section above; this grid is the library as it was
  const list = songs.filter((s) => !s.catalogue).filter((s) => {
    const cats = songCategories(s);
    return (part === 'All' || songParts(s).includes(part)) && (cat === 'All' || cats.includes(cat))
      && (!needle || s.title.toLowerCase().includes(needle) || cats.some((c) => c.toLowerCase().includes(needle)));
  });
  const paged = usePaged(list, 12, `${q}|${part}|${cat}`);

  const tabs = canQueue && (
    <div className="tabs" role="tablist" style={{ marginBottom: 4 }}>
      <button type="button" role="tab" aria-selected={tab === 'library'} className={`tab ${tab === 'library' ? 'on' : ''}`} onClick={() => setTab('library')}>Library</button>
      <button type="button" role="tab" aria-selected={tab === 'queue'} className={`tab ${tab === 'queue' ? 'on' : ''}`} onClick={() => setTab('queue')}>Upload queue</button>
      <button type="button" role="tab" aria-selected={tab === 'requests'} className={`tab ${tab === 'requests' ? 'on' : ''}`} onClick={() => setTab('requests')}>Requests</button>
      {(lib.approve || lib.approveRequests) && <button type="button" role="tab" aria-selected={tab === 'approvals'} className={`tab ${tab === 'approvals' ? 'on' : ''}`} onClick={() => setTab('approvals')}>Approvals</button>}
    </div>
  );
  if (canQueue && (lib.approve || lib.approveRequests) && tab === 'approvals') {
    return (
      <div className="stack">
        <div className="page-head"><div><h2>Music Library</h2><p className="muted small">Approving issues the permanent CHR or INS number and seals exactly what was approved.</p></div></div>
        {tabs}
        <Suspense fallback={<p className="muted small">Opening approvals…</p>}><Approvals ctx={ctx} perms={lib} /></Suspense>
      </div>
    );
  }
  if (canQueue && tab === 'requests') {
    return (
      <div className="stack">
        <div className="page-head"><div><h2>Music Library</h2><p className="muted small">Songs members have asked for, some with the score attached. Add them to the library, or answer them; members are told in Messages.</p></div></div>
        {tabs}
        <Suspense fallback={<p className="muted small">Opening requests…</p>}><SongRequests toast={toast} onOpenItem={(uid) => { setOpenItem(uid); setTab('queue'); }} /></Suspense>
      </div>
    );
  }
  if (canQueue && tab === 'queue') {
    return (
      <div className="stack">
        <div className="page-head"><div><h2>Music Library</h2><p className="muted small">Upload copies first: each is saved at once with a Q number and waits here until its details are filled in.</p></div></div>
        {tabs}
        <Suspense fallback={<p className="muted small">Opening the queue…</p>}><LibraryQueue ctx={ctx} perms={lib} openFirst={openItem} /></Suspense>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Music Library</h2><p className="muted small">{canQueue ? 'New music goes through the Upload queue: details, then approval, then it appears here.' : canEdit ? 'Edit and manage the songs already in the library.' : 'You have read-only access — enjoy the music! 🎶'}</p></div>
        <div className="head-actions">
          {!canEdit && <span className="chip"><Icon name="eye" size={13} /> Read-only</span>}
          {/* one way to add music: the Upload queue */}
          {canQueue && <button className="btn btn-pri" onClick={() => setTab('queue')}><Icon name="upload" size={15} /> Upload music</button>}
        </div>
      </div>
      {tabs}
      <Suspense fallback={null}><Catalogue me={me} toast={toast} canDraw={lib.staff} /></Suspense>
      <div className="toolbar">
        <div className="search-box"><Icon name="search" size={15} /><input placeholder="Search by song name or category…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="input sm" aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="All">All categories</option>
          {SONG_CATEGORIES.map((g) => <optgroup key={g.group} label={g.group}>{g.items.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>)}
        </select>
        <div className="chip-row">{['All', ...VOICE_PARTS].map((p) => <button key={p} className={`chip ${part === p ? 'on' : ''}`} onClick={() => setPart(p)}>{p}</button>)}</div>
      </div>
      <div className="grid g3">
        {paged.items.map((s) => {
          const up = users.find((x) => x.id === s.by);
          const playing = playId === 'song-' + s.id;
          return (
            <motion.div layout key={s.id} className="card song-card">
              <div className={`song-cover ${s.preview || s.hasPreview ? 'has-preview' : ''}`} style={{ background: `linear-gradient(135deg, ${s.cover}, ${s.cover}99)`, cursor: s.fileUrl ? 'pointer' : undefined }} onClick={() => s.fileUrl && !isMedia(s) && openCover(s)} title={s.fileUrl && !isMedia(s) ? 'Open file' : undefined}>
                {s.preview || s.hasPreview ? <Preview song={s} /> : <Icon name="note" size={40} />}
                <button className="play-fab" onClick={(e) => { e.stopPropagation(); openCover(s); }} aria-label={isMedia(s) ? (playing ? 'Pause' : 'Play') : 'Open'}><Icon name={isMedia(s) ? (playing ? 'pause' : 'play') : 'eye'} size={16} /></button>
                {s.duration && <span className="song-dur">{s.duration}</span>}
              </div>
              {playing && <div className="progress slim"><div style={{ width: playProg + '%' }} /></div>}
              <div className="song-body">
                <div className="song-title">{s.title}</div>
                <div className="muted small">{partsLabel(songParts(s))} · {s.format} · {s.size}</div>
                <div className="song-meta"><span className="chip-row wrap" style={{ gap: 4 }}>{songCategories(s).slice(0, 3).map((c) => <button type="button" key={c} className="chip sm" title={`Show ${c} songs`} onClick={() => setCat(c)}>{c}</button>)}{songCategories(s).length > 3 && <span className="chip sm" title={songCategories(s).slice(3).join(', ')}>+{songCategories(s).length - 3}</span>}</span><span className="muted tiny">{up?.name?.split(' ')[0]} · {shortDate(s.date)}</span></div>
                <div className="song-actions">
                  {canEdit ? (<>
                    <button className="btn btn-sm btn-soft" onClick={() => { setForm({ title: s.title, part: s.part, categories: songCategories(s), format: s.format, fileName: '' }); setModal({ mode: 'edit', song: s }); }}><Icon name="edit" size={13} /> Edit</button>
                    <button className="btn btn-sm btn-danger-soft" onClick={() => del(s)}><Icon name="trash" size={13} /></button>
                  </>) : (<span className="muted tiny">Managed by Custodian & President</span>)}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
      <Pagination paged={paged} label="songs" />
      {songsFailed && !songs.length && <p className="muted small">The songs could not be loaded. Check your connection and open the page again.</p>}
      {!list.length && <EmptyState icon="music" text="No songs match your search." />}
      <Modal open={!!modal} onClose={() => setModal(null)} title="Edit song">
        <div className="field"><label className="label">Song title</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Hallelujah Anthem" /></div>
        <div className="field">
          <label className="label">Voice parts <span className="muted">— {partsLabel(formParts)}</span></label>
          <div className="chip-row wrap" style={{ gap: 6 }}>
            <button type="button" className={`chip sm ${formParts.length === VOICE_PARTS.length ? 'ps-on' : ''}`} aria-pressed={formParts.length === VOICE_PARTS.length} onClick={() => setForm((f) => ({ ...f, part: ALL_PARTS }))}>All parts</button>
            {VOICE_PARTS.map((p) => <button type="button" key={p} className={`chip sm ${formParts.includes(p) ? 'ps-on' : ''}`} aria-pressed={formParts.includes(p)} onClick={() => togglePart(p)}>{formParts.includes(p) ? '✓ ' : ''}{p}</button>)}
          </div>
        </div>
        <div className="grid g2">
          <div className="field"><label className="label">Format</label><select className="input" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>{['MP3', 'Audio', 'PDF Score', 'PDF + MP3', 'MIDI', 'Image', 'Video'].map((p) => <option key={p}>{p}</option>)}</select></div>
        </div>
        <div className="field">
          <label className="label">Categories <span className="muted">— choose all that apply ({form.categories.length} chosen)</span></label>
          <div style={{ maxHeight: 210, overflowY: 'auto', border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 10px' }}>
            {SONG_CATEGORIES.map((g) => (
              <div key={g.group} style={{ marginBottom: 8 }}>
                <div className="muted tiny" style={{ fontWeight: 700, margin: '2px 0 6px' }}>{g.group}</div>
                <div className="chip-row wrap" style={{ gap: 6 }}>
                  {g.items.map((c) => {
                    const on = form.categories.includes(c);
                    return <button type="button" key={c} className="chip sm" aria-pressed={on} onClick={() => toggleCat(c)} style={on ? { background: 'var(--gold)', color: 'var(--navy)', fontWeight: 700 } : undefined}>{on ? '✓ ' : ''}{c}</button>;
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-pri" disabled={busy} onClick={save}>{busy && file ? 'Uploading…' : modal?.mode === 'new' ? 'Upload' : 'Save changes'}</button></div>
      </Modal>
    </div>
  );
}