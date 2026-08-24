import React, { useState } from 'react';
import { TODAY, uid, naira, fmtDate } from '../utils/helpers';
import { PERMS } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Avatar from '../components/ui/Avatar';
import Modal from '../components/ui/Modal';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';

export default function Debts({ ctx }) {
  const { me, users, debts, setDebts, log, toast } = ctx;
  const manage = PERMS.manageDebts(me);
  const [addOpen, setAddOpen] = useState(false);
  const [payFor, setPayFor] = useState(null);
  const [payAmt, setPayAmt] = useState('');
  const [form, setForm] = useState({ memberId: 'u7', desc: '', amount: '' });
  const billed = debts.reduce((a, d) => a + d.amount, 0);
  const collected = debts.reduce((a, d) => a + d.paid, 0);
  const mine = debts.filter((d) => d.memberId === me.id);

  const addDebt = () => {
    if (!form.desc.trim() || !+form.amount) return toast('Enter description and amount', 'err');
    setDebts((p) => [{ id: uid('d'), memberId: form.memberId, desc: form.desc, amount: +form.amount, paid: 0, date: TODAY }, ...p]);
    log('DEBT_UPDATE', `Added debt "${form.desc}" for ${users.find((u) => u.id === form.memberId)?.name}`);
    toast('Debt recorded'); setAddOpen(false); setForm({ memberId: 'u7', desc: '', amount: '' });
  };
  const confirmPay = () => {
    const amt = +payAmt;
    const bal = payFor.amount - payFor.paid;
    if (!amt || amt <= 0) return toast('Enter a valid amount', 'err');
    if (amt > bal) return toast('Amount exceeds outstanding balance', 'err');
    setDebts((p) => p.map((d) => (d.id === payFor.id ? { ...d, paid: d.paid + amt } : d)));
    log('DEBT_UPDATE', `Recorded ${naira(amt)} payment from ${users.find((u) => u.id === payFor.memberId)?.name}`);
    toast('Payment recorded'); setPayFor(null); setPayAmt('');
  };

  const Row = ({ d, manageView }) => {
    const u = users.find((x) => x.id === d.memberId);
    const pct = Math.round((d.paid / d.amount) * 100);
    return (
      <tr>
        {manageView && <td><div className="cell-user"><Avatar user={u} size={30} /><b>{u?.name}</b></div></td>}
        <td>{d.desc}</td>
        <td>{naira(d.amount)}</td>
        <td style={{ color: '#059669' }}>{naira(d.paid)}</td>
        <td><b style={{ color: d.amount - d.paid > 0 ? '#e11d48' : '#059669' }}>{naira(d.amount - d.paid)}</b></td>
        <td><div className="mini-progress"><div style={{ width: pct + '%', background: pct === 100 ? '#059669' : '#7c3aed' }} /></div><span className="tiny muted">{pct}%</span></td>
        <td className="muted small">{fmtDate(d.date)}</td>
        {manageView && (
          <td className="r">
            {d.amount - d.paid > 0 ? <button className="btn btn-sm btn-soft" onClick={() => { setPayFor(d); setPayAmt(''); }}>Record payment</button> : <span className="chip sm" style={{ color: '#059669' }}>Cleared ✓</span>}
            <button className="icon-btn" onClick={() => { setDebts((p) => p.filter((x) => x.id !== d.id)); log('DEBT_UPDATE', `Deleted debt record "${d.desc}"`); toast('Debt record removed'); }}><Icon name="trash" size={14} /></button>
          </td>
        )}
      </tr>
    );
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>{manage ? 'Debt Tracker' : 'My Debts'}</h2><p className="muted small">{manage ? 'Track debtors and record payments as they come in.' : 'Your personal debt position with the choir.'}</p></div>
        {manage && <button className="btn btn-pri" onClick={() => setAddOpen(true)}><Icon name="plus" size={15} /> Add debt</button>}
      </div>
      <div className="grid g4">
        <StatCard icon="coins" label={manage ? 'Total billed' : 'My total billed'} value={naira(manage ? billed : mine.reduce((a, d) => a + d.amount, 0))} tone="#7c3aed" />
        <StatCard icon="check" label={manage ? 'Collected' : 'Paid so far'} value={naira(manage ? collected : mine.reduce((a, d) => a + d.paid, 0))} tone="#059669" />
        <StatCard icon="clock" label="Outstanding" value={naira(manage ? billed - collected : mine.reduce((a, d) => a + (d.amount - d.paid), 0))} tone="#e11d48" />
        <StatCard icon="users" label={manage ? 'Active debtors' : 'Open records'} value={manage ? debts.filter((d) => d.amount - d.paid > 0).length : mine.filter((d) => d.amount - d.paid > 0).length} tone="#f59e0b" />
      </div>
      <div className="card pad0">
        <table className="tbl">
          <thead><tr>{manage && <th>Member</th>}<th>Description</th><th>Billed</th><th>Paid</th><th>Balance</th><th>Progress</th><th>Date</th>{manage && <th />}</tr></thead>
          <tbody>{(manage ? debts : mine).map((d) => <Row key={d.id} d={d} manageView={manage} />)}</tbody>
        </table>
        {!(manage ? debts : mine).length && <EmptyState icon="coins" text="No debt records. 🎉" />}
      </div>
      {!manage && <p className="muted tiny">💡 Payments are recorded by the President or Admin. Contact them once you make a payment.</p>}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add debt record">
        <div className="field"><label className="label">Member</label><select className="input" value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div className="field"><label className="label">Description</label><input className="input" value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="e.g. Retreat balance" /></div>
        <div className="field"><label className="label">Amount billed (₦)</label><input className="input" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button><button className="btn btn-pri" onClick={addDebt}>Save debt</button></div>
      </Modal>
      <Modal open={!!payFor} onClose={() => setPayFor(null)} title="Record payment">
        {payFor && <>
          <p className="small">{users.find((u) => u.id === payFor.memberId)?.name} — <b>{payFor.desc}</b></p>
          <p className="muted small" style={{ marginBottom: 12 }}>Outstanding balance: <b style={{ color: '#e11d48' }}>{naira(payFor.amount - payFor.paid)}</b></p>
          <div className="field"><label className="label">Amount received (₦)</label><input className="input" type="number" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} autoFocus /></div>
          <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setPayFor(null)}>Cancel</button><button className="btn btn-pri" onClick={confirmPay}>Record payment</button></div>
        </>}
      </Modal>
    </div>
  );
}