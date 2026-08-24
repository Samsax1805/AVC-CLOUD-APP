import React from 'react';
import Icon from './Icon';
export default function StatCard({ icon, label, value, sub, tone = '#7c3aed' }) {
  return (
    <div className="card stat-card">
      <div className="stat-ic" style={{ background: tone + '1a', color: tone }}><Icon name={icon} size={19} /></div>
      <div><div className="stat-val">{value}</div><div className="stat-lbl">{label}</div>{sub && <div className="stat-sub">{sub}</div>}</div>
    </div>
  );
}