import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { TODAY, uid, shortDate, VOICE_PARTS } from '../utils/helpers';
import { PERMS } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';

export default function MusicLibrary({ ctx }) {
  const { me, users, songs, setSongs, log, toast, playId, playProg, togglePlay } = ctx;
  const canEdit = PERMS.manageSongs(me);
  const [q, setQ] = useState('');
  const [part, setPart] = useState('All');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ title: '', part: 'SATB Full', tag: 'Sunday Service', format: 'MP3', fileName: '' });

  const save = () => {
    if (!form.title.trim()) return toast('Enter a song title', 'err');
    if (modal.mode === 'new') {
      const covers = ['#7c3aed', '#0284c7', '#e11d48', '#059669', '#f59e0b', '#4f46e5'];
      setSongs((p) => [{ id: uid('s'), title: form.title, part: form.part, format: form.format, size: (3 + Math.random() * 8).toFixed(1) + ' MB', duration: `${3 + Math.floor(Math.random() * 3)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`, by: me.id, date: TODAY, tag: form.tag, cover: covers[Math.floor(Math.random() * covers.length)] }, ...p]);
      log('SONG_UPLOAD', `Uploaded "${form.title}"`); toast('Song uploaded to the library');
    } else {
      setSongs((p) => p.map((s) => (s.id === modal.song.id ? { ...s, title: form.title, part: form.part, tag: form.tag, format: form.format } : s)));
      log('SONG_EDIT', `Edited "${form.title}"`); toast('Song updated');
    }
    setModal(null);
  };
  const del = (s) => { setSongs((p) => p.filter((x) => x.id !== s.id)); log('SONG_DELETE', `Deleted "${s.title}"`); toast('Song deleted'); };
  const list = songs.filter((s) => (part === 'All' || s.part === part) && s.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Music Library</h2><p className="muted small">{canEdit ? 'Upload, edit and manage song files for all choristers.' : 'You have read-only access — enjoy the music! 🎶'}</p></div>
        <div className="head-actions">
          {!canEdit && <span className="chip"><Icon name="eye" size={13} /> Read-only</span>}
          {canEdit && <button className="btn btn-pri" onClick={() => { setForm({ title: '', part: 'SATB Full', tag: 'Sunday Service', format: 'MP3', fileName: '' }); setModal({ mode: 'new' }); }}><Icon name="upload" size={15} /> Upload song</button>}
        </div>
      </div>
      <div className="toolbar">
        <div className="search-box"><Icon name="search" size={15} /><input placeholder="Search songs…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="chip-row">{['All', ...VOICE_PARTS].map((p) => <button key={p} className={`chip ${part === p ? 'on' : ''}`} onClick={() => setPart(p)}>{p}</button>)}</div>
      </div>
      <div className="grid g3">
        {list.map((s) => {
          const up = users.find((x) => x.id === s.by);
          const playing = playId === 'song-' + s.id;
          return (
            <motion.div layout key={s.id} className="card song-card">
              <div className="song-cover" style={{ background: `linear-gradient(135deg, ${s.cover}, ${s.cover}99)` }}>
                <Icon name="note" size={40} />
                <button className="play-fab" onClick={() => togglePlay('song-' + s.id)}><Icon name={playing ? 'pause' : 'play'} size={16} /></button>
                <span className="song-dur">{s.duration}</span>
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
      {!list.length && <EmptyState icon="music" text="No songs match your search." />}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === 'new' ? 'Upload a song' : 'Edit song'}>
        <div className="field"><label className="label">Song title</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Hallelujah Anthem" /></div>
        <div className="grid g2">
          <div className="field"><label className="label">Voice part</label><select className="input" value={form.part} onChange={(e) => setForm({ ...form, part: e.target.value })}>{VOICE_PARTS.map((p) => <option key={p}>{p}</option>)}</select></div>
          <div className="field"><label className="label">Format</label><select className="input" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>{['MP3', 'PDF + MP3', 'MIDI', 'PDF Score'].map((p) => <option key={p}>{p}</option>)}</select></div>
        </div>
        <div className="field"><label className="label">Tag / occasion</label><input className="input" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} /></div>
        {modal?.mode === 'new' && (
          <label className="dropzone"><Icon name="upload" size={20} /><span>{form.fileName || 'Click to choose an audio file (MP3, PDF…)'}</span><input type="file" hidden onChange={(e) => setForm({ ...form, fileName: e.target.files?.[0]?.name || '' })} /></label>
        )}
        <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-pri" onClick={save}>{modal?.mode === 'new' ? 'Upload' : 'Save changes'}</button></div>
      </Modal>
    </div>
  );
}