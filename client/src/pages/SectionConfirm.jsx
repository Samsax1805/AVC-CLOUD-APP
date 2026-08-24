import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Music2, Music3, Music4, Music, Check, Loader2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const SECTIONS = [
  { id: 'Soprano', name: 'Soprano', tagline: 'Highest voices, bright & soaring', icon: Music4, grad: 'grad-soprano' },
  { id: 'Alto', name: 'Alto', tagline: 'Warm, rich middle range', icon: Music3, grad: 'grad-alto' },
  { id: 'Tenor', name: 'Tenor', tagline: 'Bright male voices with power', icon: Music2, grad: 'grad-tenor' },
  { id: 'Bass', name: 'Bass', tagline: 'The deep foundation of harmony', icon: Music, grad: 'grad-bass' },
];

export default function SectionConfirm() {
  const { pendingGoogle, completeGoogleLogin, cancelGoogleLogin } = useAuth();
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  if (!pendingGoogle) return null;

  const save = async () => { if (!selected) return; setSaving(true); try { await completeGoogleLogin(selected); } finally { setSaving(false); } };

  return (
    <div className="sec-screen">
      <div className="sec-inner">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center" style={{ marginBottom: 32 }}>
          {pendingGoogle.avatarUrl ? (
            <img src={pendingGoogle.avatarUrl} alt="" style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 12px', display: 'block', border: '3px solid #e1b84d' }} />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#e1b84d', color: '#1a2c60', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 22, margin: '0 auto 12px' }}>
              {pendingGoogle.name?.[0] || '?'}
            </div>
          )}
          <h1 className="sec-title">Welcome, <span className="sec-gold">{pendingGoogle.name?.split(' ')[0] || 'Chorister'}</span> 👋</h1>
          <p className="sec-sub">We signed you in as <b style={{ color: '#fff' }}>{pendingGoogle.email}</b>.</p>
          <p className="sec-sub" style={{ marginTop: 4 }}>Which part do you sing in the choir?</p>
        </motion.div>
        <div className="sec-grid">
          {SECTIONS.map((s, i) => (
            <motion.button key={s.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} whileHover={{ y: -4 }} onClick={() => setSelected(s.id)} className={`sec-card ${selected === s.id ? 'sel' : ''}`}>
              <div className={`sec-ic ${s.grad}`}><s.icon size={24} /></div>
              <p className="sec-name">{s.name}</p>
              <p className="sec-tag">{s.tagline}</p>
              {selected === s.id && <div className="sec-check"><Check size={14} /></div>}
            </motion.button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 32 }}>
          <button className="btn-ghost-light" onClick={cancelGoogleLogin} disabled={saving}><X size={16} /> Cancel</button>
          <button className="btn-gold" onClick={save} disabled={!selected || saving} style={{ width: 'auto', minWidth: 180 }}>
            {saving ? <><Loader2 size={16} className="spin" /> Saving…</> : <><Check size={16} /> Confirm & Enter</>}
          </button>
        </div>
      </div>
    </div>
  );
}