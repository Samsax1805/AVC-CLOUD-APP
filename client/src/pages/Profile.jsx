import React, { useState } from 'react';
import { naira, fmtDate } from '../utils/helpers';
import { rolesOf, ROLES } from '../hooks/usePermissions';
import Avatar from '../components/ui/Avatar';
import RoleChip from '../components/ui/RoleChip';
import StatCard from '../components/ui/StatCard';

export default function ProfilePage({ ctx }) {
 function ProfilePage({ ctx }) {
  const { me, sessions, debts, songs, minutes, voiceNotes } = ctx;
  const mine = sessions.map((s) => s.records[me.id]).filter(Boolean);
  const rate = mine.length ? Math.round((mine.filter((v) => v === 'present').length / mine.length) * 100) : 0;
  const myOut = debts.filter((d) => d.memberId === me.id).reduce((a, d) => a + (d.amount - d.paid), 0);
  const [prefs, setPrefs] = useState({ email: true, election: true, song: false });
  return (
    <div className="stack">
      <div className="card profile-card">
        <div className="profile-band" />
        <div className="profile-body">
          <Avatar user={me} size={72} />
          <div>
            <h2>{me.name}</h2>
            <p className="muted small">{me.email} · {me.voice} · joined {fmtDate(me.joined)}</p>
            <div className="chip-row" style={{ marginTop: 8 }}>{rolesOf(me).map((r) => <RoleChip key={r} r={r} />)}</div>
          </div>
        </div>
      </div>
      <div className="grid g4">
        <StatCard icon="check" label="Attendance rate" value={rate + '%'} tone="#059669" />
        <StatCard icon="coins" label="Outstanding debt" value={naira(myOut)} tone="#e11d48" />
        <StatCard icon="music" label="Songs uploaded" value={songs.filter((s) => s.by === me.id).length} tone="#7c3aed" />
        <StatCard icon="mic" label="Voice notes" value={voiceNotes.filter((v) => v.by === me.id).length + minutes.filter((m) => m.by === me.id).length} sub="incl. minutes" tone="#0284c7" />
      </div>
      <div className="grid g2">
        <div className="card">
          <div className="card-h"><h3>My privileges</h3></div>
          <div className="stack sm-gap">
            {rolesOf(me).map((r) => (
              <div className="priv-row" key={r}>
                <span className="role-badge" style={{ background: ROLES[r].bg, color: ROLES[r].color }}>{ROLES[r].label}</span>
                <span className="muted small">{ROLES[r].desc}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h3>Notifications</h3></div>
          {[['email', 'Email me new minutes & receipts'], ['election', 'Alert me when an election goes live'], ['song', 'Notify me when new songs are uploaded']].map(([k, l]) => (
            <div className="pref-row" key={k}>
              <span className="small">{l}</span>
              <button className={`toggle ${prefs[k] ? 'on' : ''}`} onClick={() => setPrefs((p) => ({ ...p, [k]: !p[k] }))}><span /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
}