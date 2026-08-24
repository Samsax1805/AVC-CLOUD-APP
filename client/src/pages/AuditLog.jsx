import React, { useState } from 'react';
import { ACT_META } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Avatar from '../components/ui/Avatar';
import EmptyState from '../components/ui/EmptyState';

export default function AuditLog({ ctx }) {
  const { users, audit } = ctx;
  const [fAct, setFAct] = useState('all');
  const [fUser, setFUser] = useState('all');
  const acts = [...new Set(audit.map((a) => a.action))];
  const rows = audit.filter((a) => (fAct === 'all' || a.action === fAct) && (fUser === 'all' || a.userId === fUser));

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Audit Log</h2><p className="muted small">Every action across the platform — roles, uploads, payments, votes.</p></div>
        <div className="head-actions">
          <select className="input sm" value={fAct} onChange={(e) => setFAct(e.target.value)}><option value="all">All actions</option>{acts.map((a) => <option key={a} value={a}>{ACT_META[a]?.l || a}</option>)}</select>
          <select className="input sm" value={fUser} onChange={(e) => setFUser(e.target.value)}><option value="all">All users</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        </div>
      </div>
      <div className="card pad0">
        <table className="tbl">
          <thead><tr><th>Time</th><th>User</th><th>Role at time</th><th>Action</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((a) => {
              const u = users.find((x) => x.id === a.userId);
              const meta = ACT_META[a.action] || { l: a.action, c: '#64748b' };
              return (
                <tr key={a.id}>
                  <td className="muted small">{a.time}</td>
                  <td><div className="cell-user"><Avatar user={u} size={28} /><b>{u?.name}</b></div></td>
                  <td><span className="act-tag" style={{ background: '#1a2c601a', color: '#1a2c60' }}>{a.role || '—'}</span></td>
                  <td><span className="act-tag" style={{ background: meta.c + '1a', color: meta.c }}>{meta.l}</span></td>
                  <td className="small">{a.detail}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <EmptyState icon="shield" text="No entries match these filters." />}
      </div>
    </div>
  );
}