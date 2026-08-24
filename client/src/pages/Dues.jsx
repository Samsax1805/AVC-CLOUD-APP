import React, { useState } from 'react';
import { TODAY, uid, naira, fmtDate, duesNow } from '../utils/helpers';
import { PERMS, rolesOf, ROLES } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Avatar from '../components/ui/Avatar';
import Modal from '../components/ui/Modal';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';

export default function Dues({ ctx }) {
  const { me, users, dues, setDues, duesSettings, setDuesSettings, log, toast, notify } = ctx;
  const [tab, setTab] = useState('weekly');
  const [modal, setModal] = useState(false);
  const [setOpen, setSetOpen] = useState(false);
  const [form, setForm] = useState({ memberId: 'u2', period: '', amount: '' });
  const [sForm, setSForm] = useState({ amount: '', effectiveFrom: TODAY });
  const TYPES = { weekly: { l: 'Weekly Dues', c: '#7c3aed' }, absence: { l: 'Absence Dues', c: '#f59e0b' }, lateness: { l: 'Lateness Dues', c: '#e11d48' } };
  const current = duesNow(duesSettings);
  const rows = dues.filter((d) => d.type === tab);
  const totalOf = (t) => dues.filter((d) => d.type === t).reduce((a, d) => a + d.amount, 0);

  const save = () => {
    if (!form.period.trim()) return toast('Enter the period', 'err');
    const amt = +form.amount || (tab === 'weekly' ? current : 0);
    if (!amt) return toast('Enter an amount', 'err');
    setDues((p) => [{ id: uid('du'), type: tab, memberId: form.memberId, period: form.period, amount: amt, date: TODAY, by: me.id }, ...p]);
    log('DUES', `Recorded ${TYPES[tab].l.toLowerCase()} of ${naira(amt)} for ${users.find((u) => u.id === form.memberId)?.name}`);
    toast('Dues record saved'); setModal(false); setForm({ memberId: 'u2', period: '', amount: '' });
  };
  const saveSetting = () => {
    if (!+sForm.amount || !sForm.effectiveFrom) return toast('Enter amount and effective date', 'err');
    setDuesSettings((p) => [...p, { id: uid('ds'), amount: +sForm.amount, effectiveFrom: sForm.effectiveFrom, by: me.id, roleAtTime: rolesOf(me).map((r) => ROLES[r].label).join(' + ') }]);
    log('DUES_SET', `Set weekly dues to ${naira(+sForm.amount)} effective ${fmtDate(sForm.effectiveFrom)}`);
    notify(`Weekly dues changed to ${naira(+sForm.amount)} from ${fmtDate(sForm.effectiveFrom)}`);
    toast('New dues amount scheduled — old records untouched'); setSetOpen(false);
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Dues Records</h2><p className="muted small">Weekly, absence and lateness dues ledger.</p></div>
        <div className="head-actions">
          {PERMS.manageDuesSettings(me) && <button className="btn btn-ghost" onClick={() => setSetOpen(true)}><Icon name="dollar" size={15} /> Set weekly dues</button>}
          {PERMS.manageDues(me) && <button className="btn btn-pri" onClick={() => setModal(true)}><Icon name="plus" size={15} /> Record {TYPES[tab].l}</button>}
        </div>
      </div>
      <div className="grid g4">
        {Object.entries(TYPES).map(([k, v]) => <StatCard key={k} icon="dollar" label={v.l + ' collected'} value={naira(totalOf(k))} tone={v.c} />)}
        <StatCard icon="dollar" label="Current weekly dues" value={naira(current)} tone="#0f766e" />
      </div>
      {PERMS.manageDuesSettings(me) && (
        <div className="card">
          <div className="card-h"><h3>Dues settings history</h3><span className="chip sm">Old records keep their original amounts</span></div>
          <div className="chip-row">
            {[...duesSettings].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1)).map((s) => (
              <span key={s.id} className="chip sm">{naira(s.amount)} · from {fmtDate(s.effectiveFrom)} · {s.roleAtTime}</span>
            ))}
          </div>
        </div>
      )}
      <div className="chip-row">{Object.entries(TYPES).map(([k, v]) => <button key={k} className={`chip lg ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{v.l}</button>)}</div>
      <div className="card pad0">
        <table className="tbl">
          <thead><tr><th>Member</th><th>Period</th><th>Amount</th><th>Date</th><th>Recorded by</th>{PERMS.manageDues(me) && <th />}</tr></thead>
          <tbody>
            {rows.map((d) => {
              const u = users.find((x) => x.id === d.memberId);
              const by = users.find((x) => x.id === d.by);
              return (
                <tr key={d.id}>
                  <td><div className="cell-user"><Avatar user={u} size={30} /><b>{u?.name}</b></div></td>
                  <td>{d.period}</td>
                  <td><b>{naira(d.amount)}</b></td>
                  <td className="muted">{fmtDate(d.date)}</td>
                  <td className="muted">{by?.name}</td>
                  {PERMS.manageDues(me) && <td className="r"><button className="icon-btn" onClick={() => { setDues((p) => p.filter((x) => x.id !== d.id)); toast('Record removed'); log('DUES', `Deleted a ${TYPES[tab].l.toLowerCase()} record`); }}><Icon name="trash" size={14} /></button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <EmptyState icon="dollar" text={`No ${TYPES[tab].l.toLowerCase()} recorded yet.`} />}
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title={`Record ${TYPES[tab].l}`}>
        <div className="field"><label className="label">Member</label><select className="input" value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div className="grid g2">
          <div className="field"><label className="label">{tab === 'weekly' ? 'Week' : 'Occasion'}</label><input className="input" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} placeholder={tab === 'weekly' ? 'e.g. Week 34' : 'e.g. Aug 16 Service'} /></div>
          <div className="field"><label className="label">Amount (₦)</label><input className="input" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder={tab === 'weekly' ? `default ${current}` : ''} /></div>
        </div>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button><button className="btn btn-pri" onClick={save}>Save record</button></div>
      </Modal>
      <Modal open={setOpen} onClose={() => setSetOpen(false)} title="Set weekly dues">
        <div className="grid g2">
          <div className="field"><label className="label">Amount (₦)</label><input className="input" type="number" value={sForm.amount} onChange={(e) => setSForm({ ...sForm, amount: e.target.value })} /></div>
          <div className="field"><label className="label">Effective from</label><input className="input" type="date" value={sForm.effectiveFrom} onChange={(e) => setSForm({ ...sForm, effectiveFrom: e.target.value })} /></div>
        </div>
        <p className="muted small">Previous amounts remain in history and old records are never modified.</p>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setSetOpen(false)}>Cancel</button><button className="btn btn-pri" onClick={saveSetting}>Save setting</button></div>
      </Modal>
    </div>
  );
}