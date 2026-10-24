import React, { useState } from 'react';
import { TODAY, uid, fmtDate } from '../utils/helpers';
import { PERMS, rolesOf, ROLES } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Avatar from '../components/ui/Avatar';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import Pagination, { usePaged } from '../components/ui/Pagination';

export default function ProbationPage({ ctx }) {
  const { me, users, members, probations, setProbations, log, toast, notify } = ctx;
  const canManage = PERMS.manageProbation(me);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ memberId: '', reason: '', end: '' });
  const roleAtTime = () => rolesOf(me).map((r) => ROLES[r].label).join(' + ');
  const paged = usePaged(probations, 10);
  const add = () => {
    if (!form.memberId) return toast('Choose a member', 'err');
    if (!form.reason.trim() || !form.end) return toast('Reason and end date are required', 'err');
    setProbations((p) => [{ id: uid('pr'), memberId: form.memberId, reason: form.reason, start: TODAY, end: form.end, by: me.id, roleAtTime: roleAtTime(), status: 'active', history: [{ ev: 'Started', date: TODAY }] }, ...p]);
    log('PROBATION', `Placed ${users.find((u) => u.id === form.memberId)?.name} on probation`);
    notify(`${users.find((u) => u.id === form.memberId)?.name} has been placed on probation`);
    toast('Probation recorded'); setModal(null);
  };
  const release = (pr) => {
    setProbations((p) => p.map((x) => (x.id === pr.id ? { ...x, status: 'released', history: [...x.history, { ev: 'Released', date: TODAY }] } : x)));
    log('PROBATION', `Released ${users.find((u) => u.id === pr.memberId)?.name} from probation`); toast('Member released — history retained');
  };
  const extend = (pr) => {
    setProbations((p) => p.map((x) => (x.id === pr.id ? { ...x, end: form.end, history: [...x.history, { ev: 'Extended', date: TODAY }] } : x)));
    log('PROBATION', `Extended probation for ${users.find((u) => u.id === pr.memberId)?.name}`); toast('Probation extended'); setModal(null);
  };
  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Probation Register</h2><p className="muted small">Members on probation — full history is preserved even after release.</p></div>
        {canManage && <button className="btn btn-pri" onClick={() => { setForm({ memberId: '', reason: '', end: '' }); setModal({ mode: 'new' }); }}><Icon name="plus" size={15} /> Add probation</button>}
      </div>
      <div className="stack">
        {paged.items.map((pr) => {
          const u = users.find((x) => x.id === pr.memberId);
          return (
            <div className="card" key={pr.id}>
              <div className="min-head">
                <Avatar user={u} size={38} />
                <div style={{ flex: 1 }}>
                  <div className="min-title">{u?.name} {pr.status === 'active' ? <span className="status-badge live">On probation</span> : <span className="status-badge closed">Released</span>}</div>
                  <div className="muted small">{pr.reason} · {fmtDate(pr.start)} → {fmtDate(pr.end)} · assigned by {users.find((x) => x.id === pr.by)?.name} <span className="act-tag" style={{ background: '#b453091a', color: '#b45309' }}>{pr.roleAtTime}</span></div>
                </div>
                {canManage && pr.status === 'active' && (
                  <div className="head-actions">
                    <button className="btn btn-sm btn-soft" onClick={() => { setForm({ ...form, end: pr.end }); setModal({ mode: 'extend', doc: pr }); }}><Icon name="clock" size={13} /> Extend</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => release(pr)}><Icon name="check" size={13} /> Release</button>
                  </div>
                )}
              </div>
              <div className="dot-row" style={{ marginTop: 12 }}>
                {pr.history.map((h, i) => <span key={i} className="chip sm">{h.ev} · {fmtDate(h.date)}</span>)}
              </div>
            </div>
          );
        })}
        {!probations.length && <EmptyState icon="clock" text="No probation records. 🎉" />}
      </div>
      <Pagination paged={paged} label="records" />
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === 'extend' ? 'Extend probation' : 'Add probation'}>
        {modal?.mode === 'new' && (
          <>
            <div className="field"><label className="label">Member</label><select className="input" value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })}><option value="">Select member…</option>{members.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <div className="field"><label className="label">Reason</label><input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          </>
        )}
        <div className="field"><label className="label">End date</label><input className="input" type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></div>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-pri" onClick={() => (modal.mode === 'new' ? add() : extend(modal.doc))}>Save</button></div>
      </Modal>
    </div>
  );
}