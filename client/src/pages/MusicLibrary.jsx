import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { TODAY, uid, shortDate, VOICE_PARTS, SONG_CATEGORIES, songCategories } from '../utils/helpers';
import { PERMS } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import Pagination, { usePaged } from '../components/ui/Pagination';
import { uploadFile, deleteFile, makePreview, mediaDuration, openFile, MAX_UPLOAD_MB, sizeOf } from '../services/files';

const ACCEPT = 'audio/*,application/pdf,image/*,video/*';
const formatOf = (type) => (type === 'application/pdf' ? 'PDF Score' : type.startsWith('image/') ? 'Image' : type.startsWith('video/') ? 'Video' : type.includes('mpeg') ? 'MP3' : 'Audio');

export default function MusicLibrary({ ctx }) {
  const { me, users, songs, setSongs, log, toast, playId, playProg, togglePlay } = ctx;
  const canEdit = PERMS.manageSongs(me);
  const [q, setQ] = useState('');
  const [part, setPart] = useState('All');
  const [cat, setCat] = useState('All');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ title: '', part: 'SATB Full', categories: [], format: 'MP3', fileName: '' });

  const [file, setFile] = useState(null); // { file, preview, secs }
  const [busy, setBusy] = useState(false);
  const openNew = () => { setFile(null); setForm({ title: '', part: 'SATB Full', categories: [], format: 'MP3', fileName: '' }); setModal({ mode: 'new' }); };
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
        setSongs((p) => [{
          id: uid('s'), title: form.title, part: form.part, format: form.format, size: sizeOf(up.size),
          duration: secs ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '', by: me.id, date: TODAY, categories: form.categories,
          cover: covers[Math.floor(Math.random() * covers.length)], fileUrl: up.id, fileName: up.name, mime: up.type, preview: file.preview,
        }, ...p]);
        log('SONG_UPLOAD', `Uploaded "${form.title}"`); toast('Uploaded to the library');
      } catch (e) { return toast(e.message, 'err'); } finally { setBusy(false); }
    } else {
      setSongs((p) => p.map((s) => (s.id === modal.song.id ? { ...s, title: form.title, part: form.part, categories: form.categories, format: form.format } : s)));
      log('SONG_EDIT', `Edited "${form.title}"`); toast('Song updated');
    }
    setModal(null); setFile(null);
  };
  const del = (s) => { deleteFile(s.fileUrl); setSongs((p) => p.filter((x) => x.id !== s.id)); log('SONG_DELETE', `Deleted "${s.title}"`); toast('Song deleted'); };
  const isMedia = (s) => !s.fileUrl || /^(audio|video)\//.test(s.mime || '');
  const openCover = (s) => (isMedia(s) ? togglePlay('song-' + s.id, s.fileUrl) : openFile(s.fileUrl, s.fileName).catch((e) => toast(e.message, 'err')));
  const toggleCat = (c) => setForm((f) => ({ ...f, categories: f.categories.includes(c) ? f.categories.filter((x) => x !== c) : [...f.categories, c] }));
  // Search matches the song name or any of its categories
  const needle = q.trim().toLowerCase();
  const list = songs.filter((s) => {
    const cats = songCategories(s);
    return (part === 'All' || s.part === part) && (cat === 'All' || cats.includes(cat))
      && (!needle || s.title.toLowerCase().includes(needle) || cats.some((c) => c.toLowerCase().includes(needle)));
  });
  const paged = usePaged(list, 12, `${q}|${part}|${cat}`);

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Music Library</h2><p className="muted small">{canEdit ? 'Upload, edit and manage song files for all choristers.' : 'You have read-only access — enjoy the music! 🎶'}</p></div>
        <div className="head-actions">
          {!canEdit && <span className="chip"><Icon name="eye" size={13} /> Read-only</span>}
          {canEdit && <button className="btn btn-pri" onClick={openNew}><Icon name="upload" size={15} /> Upload song</button>}
        </div>
      </div>
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
              <div className={`song-cover ${s.preview ? 'has-preview' : ''}`} style={{ background: `linear-gradient(135deg, ${s.cover}, ${s.cover}99)`, cursor: s.fileUrl ? 'pointer' : undefined }} onClick={() => s.fileUrl && !isMedia(s) && openCover(s)} title={s.fileUrl && !isMedia(s) ? 'Open file' : undefined}>
                {s.preview ? <img src={s.preview} alt={`First page of ${s.title}`} /> : <Icon name="note" size={40} />}
                <button className="play-fab" onClick={(e) => { e.stopPropagation(); openCover(s); }} aria-label={isMedia(s) ? (playing ? 'Pause' : 'Play') : 'Open'}><Icon name={isMedia(s) ? (playing ? 'pause' : 'play') : 'eye'} size={16} /></button>
                {s.duration && <span className="song-dur">{s.duration}</span>}
              </div>
              {playing && <div className="progress slim"><div style={{ width: playProg + '%' }} /></div>}
              <div className="song-body">
                <div className="song-title">{s.title}</div>
                <div className="muted small">{s.part} · {s.format} · {s.size}</div>
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
      {!list.length && <EmptyState icon="music" text="No songs match your search." />}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === 'new' ? 'Upload a song' : 'Edit song'}>
        <div className="field"><label className="label">Song title</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Hallelujah Anthem" /></div>
        <div className="grid g2">
          <div className="field"><label className="label">Voice part</label><select className="input" value={form.part} onChange={(e) => setForm({ ...form, part: e.target.value })}>{VOICE_PARTS.map((p) => <option key={p}>{p}</option>)}</select></div>
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
        {modal?.mode === 'new' && (
          <label className="upload-drop">
            {file?.preview ? <img className="upload-preview" src={file.preview} alt="First page preview" /> : <Icon name="upload" size={22} />}
            <div style={{ minWidth: 0 }}>
              <b className="small">{busy && !file ? 'Reading file…' : form.fileName || 'Click to choose a file'}</b>
              <div className="muted tiny">{file ? (file.preview ? 'Preview of the first page' : `${form.format}${file.secs ? ` · ${Math.round(file.secs)}s` : ''} — no page preview for this type`) : `Audio, PDF score, image or video · up to ${MAX_UPLOAD_MB} MB`}</div>
            </div>
            <input type="file" hidden accept={ACCEPT} onChange={pick} />
          </label>
        )}
        <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-pri" disabled={busy} onClick={save}>{busy && file ? 'Uploading…' : modal?.mode === 'new' ? 'Upload' : 'Save changes'}</button></div>
      </Modal>
    </div>
  );
}