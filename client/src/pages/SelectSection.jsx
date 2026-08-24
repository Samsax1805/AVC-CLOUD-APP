import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Music2, Music3, Music4, Music, Check, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const SECTIONS = [
  { id: 'Soprano', name: 'Soprano', tagline: 'Highest voices, bright & soaring', icon: Music4, grad: 'grad-soprano' },
  { id: 'Alto', name: 'Alto', tagline: 'Warm, rich middle range', icon: Music3, grad: 'grad-alto' },
  { id: 'Tenor', name: 'Tenor', tagline: 'Bright male voices with power', icon: Music2, grad: 'grad-tenor' },
  { id: 'Bass', name: 'Bass', tagline: 'The deep foundation of harmony', icon: Music, grad: 'grad-bass' },
];

export default function SelectSection() {
  const { setSection } = useAuth();
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const save = async () => { if (!selected) return; setSaving(true); await setSection(selected); setSaving(false); };

  return (
    <div className="sec-screen">
      <div className="sec-inner">
        <div className="text-center" style={{ marginBottom: 32 }}>
          <img src="/choir_logo.jpeg" alt="AVC" style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 12px', display: 'block', border: '3px solid rgba(225,184,77,.4)' }} />
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="sec-title">Choose your <span className="sec-gold">choir section</span></motion.h1>
          <p className="sec-sub">This helps us tailor your rehearsals and sheet music.</p>
        </div>
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
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32 }}>
          <button className="btn-gold" onClick={save} disabled={!selected || saving} style={{ width: 'auto', padding: '0 32px' }}>
            {saving && <Loader2 size={16} className="spin" />} Save section
          </button>
        </div>
      </div>
    </div>
  );
}