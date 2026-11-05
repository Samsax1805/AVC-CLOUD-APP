import React, { useState } from 'react';
import { TODAY, uid, fmtDate, VOICE_PARTS } from '../utils/helpers';
import COUNTRIES from '../data/countries';
import PhoneField, { joinPhone } from '../components/PhoneField';
import { GRANTABLE, ROLES, PERMS } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Avatar from '../components/ui/Avatar';
import RoleChip from '../components/ui/RoleChip';
import Modal from '../components/ui/Modal';
import Pagination, { usePaged } from '../components/ui/Pagination';

const VIEWS = [
  { id: 'active', label: 'Active', test: (u) => (u.status || 'active') === 'active' && !u.roles.includes('alumni') },
  { id: 'alumni', label: 'Old Members', test: (u) => (u.status || 'active') === 'active' && u.roles.includes('alumni') },
  { id: 'deactivated', label: 'Deactivated', test: (u) => u.status === 'deactivated' },
  { id: 'all', label: 'All', test: () => true },
];

export default function MembersRoles({ ctx }) {
  const { me, users, setUsers, pendingUsers, roleHistory, setRoleHistory, log, toast, notify, memberAction, addMember, setMemberPart } = ctx;
  const canManage = PERMS.manageMembers(me);
  const canAdd = PERMS.addMembers(me);
  const canParts = PERMS.editParts(me);
  const canList = canManage || canParts;
  const blankMember = { name: '', email: '', phoneIso: 'NG', phone: '', section: '', dob: '', country: '' };
  const [adding, setAdding] = useState(null);
  const [q, setQ] = useState('');
  const [view, setView] = useState('active');
  const [grant, setGrant] = useState({});
  const [histFor, setHistFor] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const adminCount = users.filter((x) => x.roles.includes('admin') && (x.status || 'active') === 'active').length;

  const doGrant = (u) => {
    const r = grant[u.id];
    if (!r) return toast('Choose a role to grant', 'err');
    if (u.roles.includes(r)) return toast('User already has this role', 'err');
    if (r === 'alumni') return setConfirm({ action: 'alumni', u });
    setUsers((p) => p.map((x) => (x.id === u.id ? { ...x, roles: [...x.roles.filter((y) => y !== 'member'), r] } : x)));
    setRoleHistory((p) => [{ id: uid('rh'), userId: u.id, role: r, granted: TODAY, revoked: null }, ...p]);
    log('ROLE_GRANTED', `Granted ${ROLES[r].label} to ${u.name}`);
    notify(`${u.name} was granted ${ROLES[r].label}`);
    toast(`${ROLES[r].label} granted — navbar updates instantly`);
    setGrant((g) => ({ ...g, [u.id]: '' }));
  };
  // Old Member replaces every executive role (history keeps the old ones)
  const makeAlumni = (u) => {
    setUsers((p) => p.map((x) => (x.id === u.id ? { ...x, roles: ['alumni'] } : x)));
    setRoleHistory((p) => [
      { id: uid('rh'), userId: u.id, role: 'alumni', granted: TODAY, revoked: null },
      ...p.map((h) => (h.userId === u.id && !h.revoked ? { ...h, revoked: TODAY } : h)),
    ]);
    log('ROLE_GRANTED', `Made ${u.name} an Old Member`);
    notify(`${u.name} is now an Old Member`);
    toast(`${u.name} is now an Old Member (view-only)`);
    setGrant((g) => ({ ...g, [u.id]: '' }));
  };
  const doRevoke = (u, r) => {
    if (r === 'admin' && adminCount <= 1) return toast('Cannot remove the last admin', 'err');
    setUsers((p) => p.map((x) => (x.id === u.id ? { ...x, roles: x.roles.filter((y) => y !== r) } : x)));
    setRoleHistory((p) => p.map((h) => (h.userId === u.id && h.role === r && !h.revoked ? { ...h, revoked: TODAY } : h)));
    log('ROLE_REVOKED', `Revoked ${ROLES[r].label} from ${u.name}`);
    notify(`${u.name}'s ${ROLES[r].label} privilege was revoked`);
    toast(`${ROLES[r].label} revoked — history retained`);
  };
  const run = async (action, p) => {
    setBusy(true);
    try {
      await memberAction(action, p);
      const msg = {
        approve: [`MEMBER_APPROVED`, `Approved membership for ${p.name}`, `Welcome ${p.name} — membership approved`, `${p.name} approved as a member`],
        reject: [`MEMBER_REJECTED`, `Rejected membership for ${p.name}`, null, `${p.name}'s request was rejected`],
        deactivate: [`MEMBER_DEACTIVATED`, `Deactivated ${p.name}`, null, `${p.name} deactivated — their records are kept`],
        reactivate: [`MEMBER_REACTIVATED`, `Reactivated ${p.name}`, `Welcome back ${p.name}!`, `${p.name} reactivated`],
      }[action];
      log(msg[0], msg[1]);
      if (msg[2]) notify(msg[2]);
      toast(msg[3]);
      setConfirm(null);
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  const submitAdd = async () => {
    const f = adding;
    if (!f.name.trim()) return toast("Enter the member's full name", 'err');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return toast('Enter a valid email address', 'err');
    if (f.phone && f.phone.length < 7) return toast('Phone number needs at least 7 digits', 'err');
    setBusy(true);
    try {
      const { emailSent } = await addMember({
        name: f.name.trim(), email: f.email.trim(), phone: f.phone ? joinPhone(f.phoneIso, f.phone) : '',
        section: f.section, dob: f.dob, country: f.country.trim(),
      });
      log('MEMBER_ADDED', `Added ${f.name.trim()} as a member`);
      notify(`Welcome ${f.name.trim()} to the choir!`);
      toast(emailSent ? `${f.name.trim()} added — a welcome email is on its way` : `${f.name.trim()} added, but the welcome email could not be sent. Ask them to sign in with Google or use Forgot Password.`, emailSent ? undefined : 'err');
      setAdding(null);
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const changePart = async (u, section) => {
    if (!section || section === u.voice) return;
    setBusy(true);
    try {
      await setMemberPart(u, section);
      log('PART_CHANGED', `Changed ${u.name}'s part to ${section}`);
      toast(`${u.name} now sings ${section}`);
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const describe = canManage
    ? 'Add and approve members, set the part each member sings, grant/revoke privileges, deactivate members who leave, view full role history.'
    : [canAdd && 'add new members', PERMS.approveMembers(me) && 'approve or reject registrations', canParts && 'set the part each member sings']
      .filter(Boolean).join(', ').replace(/^./, (c) => c.toUpperCase()) + '.';

  const viewDef = VIEWS.find((v) => v.id === view);
  const list = users.filter((u) => viewDef.test(u) && (u.name.toLowerCase().includes(q.toLowerCase()) || u.email.includes(q.toLowerCase())));
  const paged = usePaged(list, 15, `${q}|${view}`);
  const count = (id) => users.filter(VIEWS.find((v) => v.id === id).test).length;

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Members & Roles</h2><p className="muted small">{describe}</p></div>
        <div className="head-actions">
          {canList && <div className="search-box"><Icon name="search" size={15} /><input placeholder="Search members…" value={q} onChange={(e) => setQ(e.target.value)} /></div>}
          {canAdd && <button className="btn btn-pri" onClick={() => setAdding(blankMember)}><Icon name="plus" size={15} /> Add member</button>}
        </div>
      </div>
      {PERMS.approveMembers(me) && (
        <div className="card pend-card">
          <div className="card-h"><h3>Pending approvals ({pendingUsers.length})</h3></div>
          {pendingUsers.length ? (
            <div className="stack sm-gap">
              {pendingUsers.map((p) => (
                <div className="roster-row" key={p.id} style={{ border: '1px solid #e3d8c2', borderRadius: 10 }}>
                  <Avatar user={p} size={34} />
                  <div style={{ flex: 1 }}><b>{p.name}</b><div className="muted tiny">{p.email}{p.phone ? ` · ${p.phone}` : ''} · {p.provider === 'google' ? 'Google' : 'email'} · applied {fmtDate(p.joined)}</div></div>
                  <button className="btn btn-sm btn-pri" disabled={busy} onClick={() => run('approve', p)}><Icon name="check" size={13} /> Approve</button>
                  <button className="btn btn-sm btn-danger-soft" disabled={busy} onClick={() => setConfirm({ action: 'reject', u: p })}><Icon name="x" size={13} /> Reject</button>
                </div>
              ))}
            </div>
          ) : <p className="muted small">No registrations waiting. New sign-ups appear here and the President and Provost get an email.</p>}
        </div>
      )}
      {canList && (<>
        <div className="chip-row">{VIEWS.map((v) => <button key={v.id} className={`chip ${view === v.id ? 'on' : ''}`} onClick={() => setView(v.id)}>{v.label} ({count(v.id)})</button>)}</div>
        <div className="card pad0">
          <table className="tbl">
            <thead><tr><th>Member</th><th>Voice</th><th>Granted privileges</th>{canManage && <><th>Grant new role</th><th className="r" /></>}</tr></thead>
            <tbody>
              {paged.items.map((u) => {
                const off = u.status === 'deactivated';
                return (
                  <tr key={u.id} style={off ? { opacity: 0.6 } : undefined}>
                    <td><div className="cell-user"><Avatar user={u} size={34} /><div><b>{u.name}</b>{u.id === me.id && <span className="chip sm" style={{ marginLeft: 6 }}>you</span>}{off && <span className="chip sm" style={{ marginLeft: 6, color: '#dc2626' }}>deactivated</span>}<div className="muted tiny">{u.email}</div></div></div></td>
                    <td>
                      {canParts && !off ? (
                        <select className="input sm" aria-label={`Part ${u.name} sings`} value={u.voice || ''} disabled={busy} onChange={(e) => changePart(u, e.target.value)}>
                          {!u.voice && <option value="">Not set</option>}
                          {VOICE_PARTS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      ) : <span className="chip sm">{u.voice || '—'}</span>}
                    </td>
                    <td>
                      <div className="chip-row wrap">
                        {(u.roles.length === 0 || (u.roles.length === 1 && u.roles[0] === 'member')) && <RoleChip r="member" small />}
                        {u.roles.filter((r) => r !== 'member' && ROLES[r]).map((r) => (
                          <span key={r} className="role-badge small" style={{ background: ROLES[r].bg, color: ROLES[r].color }}>
                            {ROLES[r].label}
                            {canManage && !off && !(r === 'admin' && (adminCount <= 1 || !me.roles.includes('admin'))) && <button onClick={() => doRevoke(u, r)} title="Revoke"><Icon name="x" size={11} /></button>}
                          </span>
                        ))}
                      </div>
                    </td>
                    {canManage && (<>
                    <td>
                      {!off && (
                        <div className="grant-cell">
                          <select className="input sm" value={grant[u.id] || ''} onChange={(e) => setGrant((g) => ({ ...g, [u.id]: value }))}>
                            <option value="">Select role…</option>
                            {GRANTABLE.map((r) => <option key={r} value={r} disabled={u.roles.includes(r)}>{ROLES[r].label}</option>)}
                          </select>
                          <button className="btn btn-sm btn-soft" onClick={() => doGrant(u)}>Grant</button>
                        </div>
                      )}
                    </td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => setHistFor(u)}><Icon name="clock" size={13} /> History</button>
                      {u.id !== me.id && (off
                        ? <button className="btn btn-sm btn-soft" style={{ marginLeft: 6 }} disabled={busy} onClick={() => run('reactivate', u)}><Icon name="check" size={13} /> Reactivate</button>
                        : <button className="btn btn-sm btn-danger-soft" style={{ marginLeft: 6 }} disabled={busy} onClick={() => setConfirm({ action: 'deactivate', u })}><Icon name="lock" size={13} /> Deactivate</button>)}
                    </td>
                    </>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!list.length && <p className="muted small" style={{ padding: 16 }}>No members in this view.</p>}
          <Pagination paged={paged} label="members" />
        </div>
      </>)}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={{ deactivate: 'Deactivate member', reject: 'Reject registration', alumni: 'Make Old Member' }[confirm?.action] || ''}>
        {confirm?.action === 'deactivate' && <p className="small">Deactivate <b>{confirm.u.name}</b>? They can no longer sign in, but all their records (attendance, dues, debts, history) are kept. You can reactivate them at any time.</p>}
        {confirm?.action === 'reject' && <p className="small">Reject <b>{confirm.u.name}</b>'s registration? Their sign-up is deleted; they can register again later.</p>}
        {confirm?.action === 'alumni' && <p className="small">Make <b>{confirm.u.name}</b> an Old Member? They keep view-only access and notifications, but no longer take part in attendance, dues or elections. Any executive roles they hold are removed (role history is kept).</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
          <button className="btn btn-pri" disabled={busy} onClick={() => (confirm.action === 'alumni' ? (makeAlumni(confirm.u), setConfirm(null)) : run(confirm.action, confirm.u))}>Confirm</button>
        </div>
      </Modal>
      <Modal open={!!adding} onClose={() => setAdding(null)} title="Add a member">
        {adding && (<>
          <p className="muted small" style={{ marginTop: 0 }}>They can sign in straight away and get an email explaining how. Anything you leave blank, they can fill in under Settings.</p>
          <div className="field"><label className="label" htmlFor="add-name">Full name</label><input id="add-name" className="input" value={adding.name} onChange={({ target: { value } }) => setAdding((a) => ({ ...a, name: value }))} placeholder="e.g. Grace Okafor" /></div>
          <div className="field"><label className="label" htmlFor="add-email">Email address</label><input id="add-email" type="email" className="input" value={adding.email} onChange={({ target: { value } }) => setAdding((a) => ({ ...a, email: value }))} placeholder="name@example.com" /></div>
          <div className="field"><label className="label" htmlFor="add-phone">Phone number</label><PhoneField id="add-phone" className="input" iso={adding.phoneIso} num={adding.phone} onIso={(phoneIso) => setAdding((a) => ({ ...a, phoneIso }))} onNum={(phone) => setAdding((a) => ({ ...a, phone }))} placeholder="Phone number" /></div>
          <div className="field">
            <label className="label">Part they sing</label>
            <div className="chip-row">{VOICE_PARTS.map((p) => <button type="button" key={p} className={`chip ${adding.section === p ? 'on' : ''}`} onClick={() => setAdding((a) => ({ ...a, section: a.section === p ? '' : p }))}>{p}</button>)}</div>
          </div>
          <div className="grid g2">
            <div className="field"><label className="label" htmlFor="add-dob">Date of birth</label><input id="add-dob" type="date" className="input" value={adding.dob} max={TODAY} onChange={({ target: { value } }) => setAdding((a) => ({ ...a, dob: value }))} /></div>
            <div className="field"><label className="label" htmlFor="add-country">Country</label><input id="add-country" list="add-country-list" className="input" value={adding.country} onChange={({ target: { value } }) => setAdding((a) => ({ ...a, country: value }))} placeholder="e.g. Nigeria" /><datalist id="add-country-list">{COUNTRIES.map((c) => <option key={c.iso} value={c.name} />)}</datalist></div>
          </div>
          <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setAdding(null)}>Cancel</button><button className="btn btn-pri" disabled={busy} onClick={submitAdd}>{busy ? 'Adding…' : 'Add member'}</button></div>
        </>)}
      </Modal>
      <Modal open={!!histFor} onClose={() => setHistFor(null)} title={`Role history — ${histFor?.name}`}>
        <div className="stack sm-gap">
          {roleHistory.filter((h) => h.userId === histFor?.id && ROLES[h.role]).map((h) => (
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