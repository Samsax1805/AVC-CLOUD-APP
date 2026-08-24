import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TODAY, uid, fmtDate } from '../utils/helpers';
import { PERMS, rolesOf, ROLES } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Avatar from '../components/ui/Avatar';
import Modal from '../components/ui/Modal';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';

const daysLeft = (end) => Math.ceil((new Date(end + 'T00:00:00') - new Date(TODAY + 'T00:00:00')) / 86400000);

export default function Probation({ ctx }) {
  const { me, users, probations, setProbations, log, toast, notify } = ctx;
  const canManage = PERMS.manageProbation(me);
  const [modal, setModal] = useState(null); // {mode:'new'} | {mode:'extend',doc} | {mode:'release',doc}
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState({ memberId: 'u7', reason: '', notes: '', start: TODAY, end: '' });

  const findUser = (id) => users.find((u) => u.id === id);
  const roleNow = () => rolesOf(me).map((r) => ROLES[r].label).join(' + ');

  const addProbation = () => {
    if (!form.reason.trim() || !form.end) return toast('Reason and end date are required', 'err');
    const rec = {
      id: uid('pr'), memberId: form.memberId, reason: form.reason.trim(), notes: form.notes.trim(),
      start: form.start || TODAY, end: form.end, by: me.id, roleAtTime: roleNow(), status: 'active',
      history: [{ ev: 'Started', date: form.start || TODAY, by: me.name }],
    };
    setProbations((p) => [rec, ...p]);
    log('PROBATION', `Placed ${findUser(form.memberId)?.name} on probation till ${fmtDate(form.end)}`);
    notify(`${findUser(form.memberId)?.name} has been placed on probation`);
    toast('Probation record created');
    setModal(null); setForm({ memberId: 'u7', reason: '', notes: '', start: TODAY, end: '' });
  };

  const extend = (doc) => {
    if (!form.end) return toast('Choose a new end date', 'err');
    setProbations((p) => p.map((x) => (x.id === doc.id ? {
      ...x, end: form.end, notes: form.notes.trim() || x.notes,
      history: [...x.history, { ev: 'Extended', date: TODAY, by: me.name, note: `New end date ${fmtDate(form.end)}` }],
    } : x)));
    log('PROBATION', `Extended probation for ${findUser(doc.memberId)?.name} to ${fmtDate(form.end)}`);
    toast('Probation extended'); setModal(null);
  };

  const release = (doc) => {
    setProbations((p) => p.map((x) => (x.id === doc.id ? {
      ...x, status: 'released',
      history: [...x.history, { ev: 'Released', date: TODAY, by: me.name }],
    } : x)));
    log('PROBATION', `Released ${findUser(doc.memberId)?.name} from probation`);
    notify(`${findUser(doc.memberId)?.name} has been released from probation`);
    toast('Member released — history retained'); setModal(null);
  };

  const active = probations.filter((p) => p.status === 'active');
  const expiring = active.filter((p) => daysLeft(p.end) <= 7);
  const released = probations.filter((p) => p.status === 'released');
  const list = [...probations]
    .filter((p) => (canManage ? true : p.memberId === me.id))
    .sort((a, b) => (a.status === b.status ? (a.end < b.end ? -1 : 1) : a.status === 'active' ? -1 : 1));

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Probation Register</h2>
          <p className="muted small">{canManage ? 'Place members on probation, extend or release them — history is never deleted.' : 'Your personal probation record.'}</p>
        </div>
        {canManage && (
          <button className="btn btn-pri" onClick={() => { setForm({ memberId: users[0]?.id || 'u7', reason: '', notes: '', start: TODAY, end: '' }); setModal({ mode: 'new' }); }}>
            <Icon name="plus" size={15} /> Add probation
          </button>
        )}
      </div>

      <div className="grid g4">
        <StatCard icon="clock" label="Active probations" value={active.length} tone="#b45309" />
        <StatCard icon="calendar" label="Expiring in 7 days" value={expiring.length} tone="#f59e0b" />
        <StatCard icon="check" label="Released / completed" value={released.length} tone="#059669" />
        <StatCard icon="shield" label="Total records" value={probations.length} tone="#1a2c60" />
      </div>

      <div className="stack">
        {list.map((pr) => {
          const u = findUser(pr.memberId);
          const assignedBy = findUser(pr.by);
          const dl = daysLeft(pr.end);
          const open = openId === pr.id;
          return (
            <div className="card" key={pr.id}>
              <div className="min-head">
                <Avatar user={u} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="min-title">
                    {u?.name}{' '}
                    {pr.status === 'active' ? <span className="status-badge live">On probation</span> : <span className="status-badge closed">Released</span>}
                  </div>
                  <div className="muted small">{pr.reason}</div>
                  <div className="muted tiny" style={{ marginTop: 4 }}>
                    {fmtDate(pr.start)} → {fmtDate(pr.end)} · assigned by {assignedBy?.name}{' '}
                    <span className="act-tag" style={{ background: '#b453091a', color: '#b45309' }}>{pr.roleAtTime}</span>
                  </div>
                </div>
                <div className="head-actions">
                  {pr.status === 'active' && (
                    <span className="att-pill" style={dl >= 0 ? { background: '#fef3c7', color: '#d97706' } : { background: '#fee2e2', color: '#dc2626' }}>
                      {dl >= 0 ? `${dl} days left` : `${-dl} days over`}
                    </span>
                  )}
                  {canManage && pr.status === 'active' && (
                    <>
                      <button className="btn btn-sm btn-soft" onClick={() => { setForm({ memberId: pr.memberId, reason: pr.reason, notes: '', start: pr.start, end: pr.end }); setModal({ mode: 'extend', doc: pr }); }}>
                        <Icon name="calendar" size={13} /> Extend
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => setModal({ mode: 'release', doc: pr })}>
                        <Icon name="check" size={13} /> Release
                      </button>
                    </>
                  )}
                  <button className="btn btn-sm btn-ghost" onClick={() => setOpenId(open ? null : pr.id)}>{open ? 'Hide history' : 'History'}</button>
                </div>
              </div>

              {pr.notes && <p className="small" style={{ marginTop: 10, lineHeight: 1.6 }}>{pr.notes}</p>}

              <AnimatePresence>
                {open && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="min-body">
                    <div className="stack sm-gap">
                      {pr.history.map((h, i) => (
                        <div className="feed-row" key={i} style={{ borderBottom: 'none', padding: '6px 0' }}>
                          <span className="act-tag" style={{ background: '#1a2c601a', color: '#1a2c60' }}>{h.ev}</span>
                          <span className="muted small">{fmtDate(h.date)}{h.by ? ` · by ${h.by}` : ''}</span>
                          {h.note && <span className="muted tiny">— {h.note}</span>}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
        {!list.length && <EmptyState icon="clock" text="No probation records. 🎉" />}
      </div>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.mode === 'new' ? 'Place member on probation' : modal?.mode === 'extend' ? 'Extend probation' : 'Release from probation'}
      >
        {modal?.mode === 'new' && (
          <>
            <div className="field">
              <label className="label">Member</label>
              <select className="input" value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })}>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">Reason</label>
              <input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Repeated lateness (3 strikes)" />
            </div>
            <div className="field">
              <label className="label">Notes (optional)</label>
              <textarea className="input area" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Agreed corrective actions, reviews…" />
            </div>
            <div className="grid g2">
              <div className="field"><label className="label">Start date</label><input className="input" type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
              <div className="field"><label className="label">End date</label><input className="input" type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></div>
            </div>
          </>
        )}
        {modal?.mode === 'extend' && (
          <>
            <p className="small">Current end date: <b>{fmtDate(modal.doc.end)}</b></p>
            <div className="field"><label className="label">New end date</label><input className="input" type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></div>
            <div className="field"><label className="label">Review note (optional)</label><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Reviewed by execo — one more month" /></div>
          </>
        )}
        {modal?.mode === 'release' && (
          <p className="small">
            <b>{findUser(modal.doc.memberId)?.name}</b> will be marked as <b>released</b> today ({fmtDate(TODAY)}).
            The record and its full history remain in the register.
          </p>
        )}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn btn-pri" onClick={() => (modal?.mode === 'new' ? addProbation() : modal?.mode === 'extend' ? extend(modal.doc) : release(modal.doc))}>
            {modal?.mode === 'new' ? 'Save probation' : modal?.mode === 'extend' ? 'Save extension' : 'Release member'}
          </button>
        </div>
      </Modal>
    </div>
  );
}