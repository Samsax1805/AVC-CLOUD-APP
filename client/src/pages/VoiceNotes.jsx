import React, { useState, useEffect, useRef } from 'react';
import { TODAY, uid, fmtDur, fmtDate } from '../utils/helpers';
import { PERMS } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Wave from '../components/ui/Wave';
import Modal from '../components/ui/Modal';
import Pagination, { usePaged } from '../components/ui/Pagination';
import { uploadFile, deleteFile, mediaDuration, openFile, MAX_UPLOAD_MB } from '../services/files';

export default function VoicePage({ ctx }) {
  const { me, users, voiceNotes, setVoiceNotes, log, toast, playId, playProg, togglePlay } = ctx;
  const canRec = PERMS.recordVoice(me);
  const paged = usePaged(voiceNotes, 12);
  const [mode, setMode] = useState('record');
  const [recOn, setRecOn] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [pending, setPending] = useState(null); // { blob, name, secs, source }
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const recorder = useRef(null);
  const fileInput = useRef(null);

  useEffect(() => {
    if (!recOn) return;
    const t = setInterval(() => setRecSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recOn]);
  useEffect(() => () => recorder.current?.stream?.getTracks().forEach((t) => t.stop()), []);

  const startRec = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return toast('Recording is not supported in this browser — use Upload instead', 'err');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = rec.mimeType || 'audio/webm';
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        setPending((p) => ({ ...p, blob: new Blob(chunks, { type }), name: `voice-note-${Date.now()}.${ext}`, source: 'recorded' }));
      };
      recorder.current = rec;
      rec.start();
      setRecSecs(0); setRecOn(true);
    } catch { toast('Microphone access was blocked — allow it in the browser to record', 'err'); }
  };
  const stopRec = () => { setRecOn(false); setPending({ secs: recSecs }); recorder.current?.stop(); };

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('audio/')) return toast('Choose an audio file (MP3, M4A, WAV…)', 'err');
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return toast(`File is larger than ${MAX_UPLOAD_MB} MB`, 'err');
    setPending({ blob: file, name: file.name, secs: Math.round(await mediaDuration(file)), source: 'uploaded' });
    setTitle(file.name.replace(/\.[^.]+$/, ''));
  };

  const discard = () => { setPending(null); setTitle(''); setRecSecs(0); };
  const save = async () => {
    if (!title.trim()) return toast('Give the voice note a title', 'err');
    if (!pending?.blob) return toast('The recording is still being prepared — try again', 'err');
    setSaving(true);
    try {
      const f = await uploadFile(pending.blob, pending.name);
      setVoiceNotes((p) => [{ id: uid('v'), title: title.trim(), duration: fmtDur(pending.secs || 0), by: me.id, date: TODAY, seed: Math.floor(Math.random() * 30), fileUrl: f.id, fileName: f.name, mime: f.type, source: pending.source }, ...p]);
      log('VOICE', `${pending.source === 'uploaded' ? 'Uploaded' : 'Recorded'} voice note "${title.trim()}"`);
      toast('Voice note shared with all choristers');
      discard();
    } catch (e) { toast(e.message, 'err'); } finally { setSaving(false); }
  };
  const remove = (v) => {
    deleteFile(v.fileUrl);
    setVoiceNotes((p) => p.filter((x) => x.id !== v.id));
    log('VOICE', `Deleted voice note "${v.title}"`); toast('Voice note deleted');
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Voice Notes</h2><p className="muted small">{canRec ? 'Record or upload guides & corrections for choristers across all accounts.' : 'Listen to voice guides from your Custodian and President.'}</p></div>
      </div>
      {canRec && (
        <div className="card">
          <div className="chip-row" style={{ marginBottom: 14 }}>
            <button className={`chip ${mode === 'record' ? 'on' : ''}`} disabled={recOn} onClick={() => setMode('record')}><Icon name="mic" size={13} /> Record</button>
            <button className={`chip ${mode === 'upload' ? 'on' : ''}`} disabled={recOn} onClick={() => setMode('upload')}><Icon name="upload" size={13} /> Upload</button>
          </div>
          {mode === 'record' ? (
            <div className="rec-card">
              <button className={`rec-btn ${recOn ? 'on' : ''}`} onClick={() => (recOn ? stopRec() : startRec())} aria-label={recOn ? 'Stop recording' : 'Start recording'}>
                <Icon name="mic" size={22} />
              </button>
              <div>
                <div className="rec-state">{recOn ? <>Recording… <b>{fmtDur(recSecs)}</b></> : 'Ready to record'}</div>
                <div className="muted small">{recOn ? 'Tap the mic again to stop & save.' : 'Tap the mic to record a voice guide (your browser will ask for the microphone).'}</div>
              </div>
              {recOn && <div className="rec-live"><Wave seed={4} active color="#e11d48" /></div>}
            </div>
          ) : (
            <div className="rec-card">
              <button className="rec-btn" onClick={() => fileInput.current?.click()} aria-label="Choose an audio file"><Icon name="upload" size={22} /></button>
              <div>
                <div className="rec-state">Upload an audio file</div>
                <div className="muted small">MP3, M4A, WAV or other audio, up to {MAX_UPLOAD_MB} MB.</div>
              </div>
              <input ref={fileInput} type="file" accept="audio/*" hidden onChange={pickFile} />
            </div>
          )}
        </div>
      )}
      <div className="grid g3">
        {paged.items.map((v) => {
          const by = users.find((x) => x.id === v.by);
          const playing = playId === 'vn-' + v.id;
          return (
            <div className="card vn-card" key={v.id}>
              <div className="vn-card-top">
                <button className="vn-play" onClick={() => togglePlay('vn-' + v.id, v.fileUrl)} aria-label={playing ? 'Pause' : 'Play'}><Icon name={playing ? 'pause' : 'play'} size={15} /></button>
                <div className="vn-main">
                  <div className="vn-title">{v.title}</div>
                  <div className="muted tiny">{by?.name || 'Former member'} · {fmtDate(v.date)}</div>
                </div>
              </div>
              <Wave seed={v.seed} active={playing} />
              {playing && <div className="progress slim"><div style={{ width: playProg + '%' }} /></div>}
              <div className="vn-card-foot">
                <span className="chip sm">{v.duration || '—'}</span>
                {v.source && <span className="muted tiny">{v.source === 'uploaded' ? 'Uploaded' : 'Recorded'}</span>}
                <span style={{ flex: 1 }} />
                {v.fileUrl && <button className="icon-btn" title="Download" onClick={() => openFile(v.fileUrl, v.fileName).catch((e) => toast(e.message, 'err'))}><Icon name="upload" size={14} style={{ transform: 'rotate(180deg)' }} /></button>}
                {canRec && <button className="icon-btn" title="Delete" onClick={() => remove(v)}><Icon name="trash" size={14} /></button>}
              </div>
            </div>
          );
        })}
      </div>
      {!voiceNotes.length && <p className="muted small">No voice notes yet.</p>}
      <Pagination paged={paged} label="voice notes" />
      <Modal open={!!pending && !recOn} onClose={discard} title="Save voice note">
        <div className="field"><label className="label">Title</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder='e.g. Alto guide — "You Are Worthy" chorus' /></div>
        <p className="muted small">Length: <b>{fmtDur(pending?.secs || 0)}</b> — visible to every chorister.</p>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={discard}>Discard</button><button className="btn btn-pri" disabled={saving} onClick={save}>{saving ? 'Uploading…' : 'Upload'}</button></div>
      </Modal>
    </div>
  );
}
