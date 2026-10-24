import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { TODAY, uid, shortDate, VOICE_PARTS } from '../utils/helpers';
import { PERMS } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import Pagination, { usePaged } from '../components/ui/Pagination';
import { uploadFile, deleteFile, makePreview, mediaDuration, openFile, MAX_UPLOAD_MB } from '../services/files';

const ACCEPT = 'audio/*,application/pdf,image/*,video/*';
const formatOf = (type) => (type === 'application/pdf' ? 'PDF Score' : type.startsWith('image/') ? 'Image' : type.startsWith('video/') ? 'Video' : type.includes('mpeg') ? 'MP3' : 'Audio');
const sizeOf = (bytes) => (bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB');

export default function MusicLibrary({ ctx }) {
  const { me, users, songs, setSongs, log, toast, playId, playProg, togglePlay } = ctx;
  const canEdit = PERMS.manageSongs(me);
  const [q, setQ] = useState('');
  const [part, setPart] = useState('All');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ title: '', part: 'SATB Full', tag: 'Sunday Service', format: 'MP3', fileName: '' });

  const [file, setFile] = useState(null); // { file, preview, secs }
  const [busy, setBusy] = useState(false);
  const openNew = () => { setFile(null); setForm({ title: '', part: 'SATB Full', tag: 'Sunday Service', format: 'MP3', fileName: '' }); setModal({ mode: 'new' }); };
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
          duration: secs ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '', by: me.id, date: TODAY, tag: form.tag,
          cover: covers[Math.floor(Math.random() * covers.length)], fileUrl: up.id, fileName: up.name, mime: up.type, preview: file.preview,
        }, ...p]);
        log('SONG_UPLOAD', `Uploaded "${form.title}"`); toast('Uploaded to the library');
      } catch (e) { return toast(e.message, 'err'); } finally { setBusy(false); }
    } else {
      setSongs((p) => p.map((s) => (s.id === modal.song.id ? { ...s, title: form.title, part: form.part, tag: form.tag, format: form.format } : s)));
      log('SONG_EDIT', `Edited "${form.title}"`); toast('Song updated');
    }
    setModal(null); setFile(null);
  };
  const del = (s) => { deleteFile(s.fileUrl); setSongs((p) => p.filter((x) => x.id !== s.id)); log('SONG_DELETE', `Deleted "${s.title}"`); toast('Song deleted'); };
  const isMedia = (s) => !s.fileUrl || /^(audio|video)\//.test(s.mime || '');
  const openCover = (s) => (isMedia(s) ? togglePlay('song-' + s.id, s.fileUrl) : openFile(s.fileUrl, s.fileName).catch((e) => toast(e.message, 'err')));
  const list = songs.filter((s) => (part === 'All' || s.part === part) && s.title.toLowerCase().includes(q.toLowerCase()));
  const paged = usePaged(list, 12, `${q}|${part}`);

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
        <div className="search-box"><Icon name="search" size={15} /><input placeholder="Search songs…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
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
                <div className="song-meta"><span className="chip sm">{s.tag}</span><span className="muted tiny">{up?.name?.split(' ')[0]} · {shortDate(s.date)}</span></div>
                <div className="song-actions">
                  {canEdit ? (<>
                    <button className="btn btn-sm btn-soft" onClick={() => { setForm({ title: s.title, part: s.part, tag: s.tag, format: s.format, fileName: '' }); setModal({ mode: 'edit', song: s }); }}><Icon name="edit" size={13} /> Edit</button>
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
        <div className="field"><label className="label">Tag / occasion</label><input className="input" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} /></div>
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