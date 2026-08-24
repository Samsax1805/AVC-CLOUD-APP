import React, { useState, useEffect } from 'react';
import { TODAY, uid, fmtDur, fmtDate } from '../utils/helpers';
import { PERMS } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Wave from '../components/ui/Wave';
import Modal from '../components/ui/Modal';

export default function VoiceNotes({ ctx }) {
  const { me, users, voiceNotes, setVoiceNotes, log, toast, playId, playProg, togglePlay } = ctx;
  const canRec = PERMS.recordVoice(me);
  const [recOn, setRecOn] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [titleModal, setTitleModal] = useState(false);
  const [recTitle, setRecTitle] = useState('');

  useEffect(() => { if (!recOn) return; const t = setInterval(() => setRecSecs((s) => s + 1), 1000); return () => clearInterval(t); }, [recOn]);

  const saveRec = () => {
    if (!recTitle.trim()) return toast('Give the voice note a title', 'err');
    setVoiceNotes((p) => [{ id: uid('v'), title: recTitle, duration: fmtDur(recSecs), by: me.id, date: TODAY, seed: Math.floor(Math.random() * 30) }, ...p]);
    log('VOICE', `Recorded voice note "${recTitle}"`); toast('Voice note uploaded for all choristers');
    setTitleModal(false); setRecTitle(''); setRecSecs(0);
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Voice Notes</h2><p className="muted small">{canRec ? 'Record guides & corrections for choristers across all accounts.' : 'Listen to voice guides from your Custodian and President.'}</p></div>
      </div>
      {canRec && (
        <div className="card rec-card">
          <button className={`rec-btn ${recOn ? 'on' : ''}`} onClick={() => (recOn ? (setRecOn(false), setTitleModal(true)) : setRecOn(true))}><Icon name="mic" size={22} /></button>
          <div>
            <div className="rec-state">{recOn ? <>Recording… <b>{fmtDur(recSecs)}</b></> : 'Ready to record'}</div>
            <div className="muted small">{recOn ? 'Tap the mic again to stop & save.' : 'Tap the mic to start a voice guide for choristers.'}</div>
          </div>
          {recOn && <div className="rec-live"><Wave seed={4} active color="#e11d48" /></div>}
        </div>
      )}
      <div className="stack">
        {voiceNotes.map((v) => {
          const by = users.find((x) => x.id === v.by);
          const playing = playId === 'vn-' + v.id;
          return (
            <div className="card vn-row" key={v.id}>
              <button className="vn-play" onClick={() => togglePlay('vn-' + v.id)}><Icon name={playing ? 'pause' : 'play'} size={15} /></button>
              <div className="vn-main">
                <div className="vn-title">{v.title}</div>
                <div className="muted tiny">{by?.name} · {fmtDate(v.date)} · {v.duration}</div>
              </div>
              <Wave seed={v.seed} active={playing} />
              {playing && <div className="progress" style={{ width: 80 }}><div style={{ width: playProg + '%' }} /></div>}
              {canRec && <button className="icon-btn" onClick={() => { setVoiceNotes((p) => p.filter((x) => x.id !== v.id)); log('VOICE', `Deleted voice note "${v.title}"`); toast('Voice note deleted'); }}><Icon name="trash" size={15} /></button>}
            </div>
          );
        })}
      </div>
      <Modal open={titleModal} onClose={() => setTitleModal(false)} title="Save voice note">
        <div className="field"><label className="label">Title</label><input className="input" value={recTitle} onChange={(e) => setRecTitle(e.target.value)} placeholder='e.g. Alto guide — "You Are Worthy" chorus' /></div>
        <p className="muted small">Length: <b>{fmtDur(recSecs)}</b> — visible to every chorister.</p>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={() => { setTitleModal(false); setRecSecs(0); }}>Discard</button><button className="btn btn-pri" onClick={saveRec}>Upload</button></div>
      </Modal>
    </div>
  );
}