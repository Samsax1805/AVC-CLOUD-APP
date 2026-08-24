import React, { useState } from 'react';
import { TODAY, uid, fmtDate } from '../utils/helpers';
import { GRANTABLE, ROLES, PERMS } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Avatar from '../components/ui/Avatar';
import RoleChip from '../components/ui/RoleChip';
import Modal from '../components/ui/Modal';

export default function MembersRoles({ ctx }) {
  const { me, users, setUsers, pendingUsers, setPendingUsers, roleHistory, setRoleHistory, log, toast, notify } = ctx;
  const [q, setQ] = useState('');
  const [grant, setGrant] = useState({});
  const [histFor, setHistFor] = useState(null);

  const doGrant = (u) => {
    const r = grant[u.id];
    if (!r) return toast('Choose a role to grant', 'err');
    if (u.roles.includes(r)) return toast('User already has this role', 'err');
    setUsers((p) => p.map((x) => (x.id === u.id ? { ...x, roles: [...x.roles, r] } : x)));
    setRoleHistory((p) => [{ id: uid('rh'), userId: u.id, role: r, granted: TODAY, revoked: null }, ...p]);
    log('ROLE_GRANTED', `Granted ${ROLES[r].label} to ${u.name}`);
    notify(`${u.name} was granted ${ROLES[r].label}`);
    toast(`${ROLES[r].label} granted — navbar updates instantly`);
    setGrant((g) => ({ ...g, [u.id]: '' }));
  };
  const doRevoke = (u, r) => {
    if (r === 'admin' && users.filter((x) => x.roles.includes('admin')).length <= 1) return toast('Cannot remove the last admin', 'err');
    setUsers((p) => p.map((x) => (x.id === u.id ? { ...x, roles: x.roles.filter((y) => y !== r) } : x)));
    setRoleHistory((p) => p.map((h) => (h.userId === u.id && h.role === r && !h.revoked ? { ...h, revoked: TODAY } : h)));
    log('ROLE_REVOKED', `Revoked ${ROLES[r].label} from ${u.name}`);
    notify(`${u.name}'s ${ROLES[r].label} privilege was revoked`);
    toast(`${ROLES[r].label} revoked — history retained`);
  };
  const approve = (p) => {
    setUsers((x) => [...x, { ...p, id: uid('u') }]);
    setPendingUsers((x) => x.filter((y) => y.id !== p.id));
    log('MEMBER_APPROVED', `Approved membership for ${p.name}`);
    notify(`Welcome ${p.name} — membership approved`);
    toast(`${p.name} approved as a member`);
  };
  const reject = (p) => { setPendingUsers((x) => x.filter((y) => y.id !== p.id)); log('MEMBER_REJECTED', `Rejected membership for ${p.name}`); toast(`${p.name}'s request was rejected`); };
  const list = users.filter((u) => u.name.toLowerCase().includes(q.toLowerCase()) || u.email.includes(q.toLowerCase()));

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Members & Roles</h2><p className="muted small">Approve new members, grant/revoke privileges, view full role history.</p></div>
        <div className="search-box"><Icon name="search" size={15} /><input placeholder="Search members…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {PERMS.approveMembers(me) && pendingUsers.length > 0 && (
        <div className="card pend-card">
          <div className="card-h"><h3>Pending approvals ({pendingUsers.length})</h3></div>
          <div className="stack sm-gap">
            {pendingUsers.map((p) => (
              <div className="roster-row" key={p.id} style={{ border: '1px solid #e3d8c2', borderRadius: 10 }}>
                <Avatar user={p} size={34} />
                <div style={{ flex: 1 }}><b>{p.name}</b><div className="muted tiny">{p.email} · {p.voice} · applied {fmtDate(p.joined)}</div></div>
                <button className="btn btn-sm btn-pri" onClick={() => approve(p)}><Icon name="check" size={13} /> Approve</button>
                <button className="btn btn-sm btn-danger-soft" onClick={() => reject(p)}><Icon name="x" size={13} /> Reject</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="card pad0">
        <table className="tbl">
          <thead><tr><th>Member</th><th>Voice</th><th>Granted privileges</th><th>Grant new role</th><th className="r" /></tr></thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id}>
                <td><div className="cell-user"><Avatar user={u} size={34} /><div><b>{u.name}</b>{u.id === me.id && <span className="chip sm" style={{ marginLeft: 6 }}>you</span>}<div className="muted tiny">{u.email}</div></div></div></td>
                <td><span className="chip sm">{u.voice}</span></td>
                <td>
                  <div className="chip-row wrap">
                    {u.roles.length === 0 && <RoleChip r="member" small />}
                    {u.roles.map((r) => (
                      <span key={r} className="role-badge small" style={{ background: ROLES[r].bg, color: ROLES[r].color }}>
                        {ROLES[r].label}
                        {!(r === 'admin' && users.filter((x) => x.roles.includes('admin')).length <= 1) && <button onClick={() => doRevoke(u, r)} title="Revoke"><Icon name="x" size={11} /></button>}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <div className="grant-cell">
                    <select className="input sm" value={grant[u.id] || ''} onChange={(e) => setGrant((g) => ({ ...g, [u.id]: e.target.value }))}>
                      <option value="">Select role…</option>
                      {GRANTABLE.map((r) => <option key={r} value={r} disabled={u.roles.includes(r)}>{ROLES[r].label}</option>)}
                    </select>
                    <button className="btn btn-sm btn-soft" onClick={() => doGrant(u)}>Grant</button>
                  </div>
                </td>
                <td className="r"><button className="btn btn-sm btn-ghost" onClick={() => setHistFor(u)}><Icon name="clock" size={13} /> History</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={!!histFor} onClose={() => setHistFor(null)} title={`Role history — ${histFor?.name}`}>
        <div className="stack sm-gap">
          {roleHistory.filter((h) => h.userId === histFor?.id).map((h) => (
            <div className="pref-row" key={h.id}>
              <span className="role-badge small" style={{ background: ROLES[h.role].bg, color: ROLES[h.role].color }}>{ROLES[h.role].label}</span>
              <span className="muted small">{fmtDate(h.granted)} → {h.revoked ? fmtDate(h.revoked) : 'present'}</span>
            </div>
          ))}
          {!roleHistory.filter((h) => h.userId === histFor?.id).length && <p className="muted small">No role history — lifelong member.</p>}
        </div>
        <p className="muted tiny" style={{ marginTop: 12 }}>💡 Audit entries always store the role held <b>at the time of the action</b>, so history stays truthful even after role changes.</p>
      </Modal>
    </div>
  );
}