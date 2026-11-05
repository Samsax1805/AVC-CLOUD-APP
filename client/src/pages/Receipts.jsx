import React, { useState } from 'react';
import { TODAY, uid, naira, fmtDate } from '../utils/helpers';
import { PERMS } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Modal from '../components/ui/Modal';
import StatCard from '../components/ui/StatCard';
import Pagination, { usePaged } from '../components/ui/Pagination';
import { uploadFile, deleteFile, openFile, sizeOf, MAX_UPLOAD_MB, DOC_ACCEPT } from '../services/files';

export default function ReceiptsPage({ ctx }) {
  const { me, users, receipts, setReceipts, log, toast } = ctx;
  const canManage = PERMS.manageReceipts(me);
  const [modal, setModal] = useState(false);
  const paged = usePaged(receipts, 10);
  const [form, setForm] = useState({ title: '', amount: '', category: 'Equipment' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const total = receipts.reduce((a, r) => a + r.amount, 0);
  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) return toast(`File is larger than ${MAX_UPLOAD_MB} MB`, 'err');
    setFile(f);
  };
  // The scan or photo of the receipt is optional; the amount and description are always recorded
  const save = async () => {
    if (!form.title.trim() || !+form.amount) return toast('Enter a valid title and amount', 'err');
    let up = null;
    if (file) {
      setBusy(true);
      try { up = await uploadFile(file); } catch (e) { setBusy(false); return toast(e.message, 'err'); }
      setBusy(false);
    }
    setReceipts((p) => [{ id: uid('r'), title: form.title, amount: +form.amount, category: form.category, date: TODAY, by: me.id, ...(up && { fileUrl: up.id, fileName: up.name, mime: up.type }) }, ...p]);
    log('RECEIPT', `Uploaded receipt "${form.title}" (${naira(+form.amount)})`); toast('Receipt uploaded'); setModal(false); setForm({ title: '', amount: '', category: 'Equipment' }); setFile(null);
  };
  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Receipts</h2><p className="muted small">{canManage ? 'Upload receipts & supporting documents.' : 'Read-only financial records.'}</p></div>
        {canManage ? <button className="btn btn-pri" onClick={() => setModal(true)}><Icon name="plus" size={15} /> Add receipt</button> : <span className="chip"><Icon name="eye" size={13} /> Read-only</span>}
      </div>
      <div className="grid g3">
        <StatCard icon="receipt" label="Total documented" value={naira(total)} tone="#0284c7" />
        <StatCard icon="file" label="Receipts on file" value={receipts.length} tone="#1a2c60" />
        <StatCard icon="calendar" label="This month" value={naira(receipts.filter((r) => r.date.startsWith(TODAY.slice(0, 7))).reduce((a, r) => a + r.amount, 0))} tone="#e9a63a" />
      </div>
      <div className="card pad0">
        <table className="tbl">
          <thead><tr><th>Receipt</th><th>Category</th><th>Date</th><th>Uploaded by</th><th className="r">Amount</th>{canManage && <th />}</tr></thead>
          <tbody>
            {paged.items.map((r) => {
              const by = users.find((x) => x.id === r.by);
              return (
                <tr key={r.id}>
                  <td><b>{r.title}</b>{r.fileUrl && <div><button className="btn btn-sm btn-ghost" style={{ padding: '2px 0' }} onClick={() => openFile(r.fileUrl, r.fileName).catch((e) => toast(e.message, 'err'))}><Icon name="eye" size={12} /> View receipt</button></div>}</td>
                  <td><span className="chip sm">{r.category}</span></td>
                  <td className="muted">{fmtDate(r.date)}</td>
                  <td className="muted">{by?.name}</td>
                  <td className="r"><b>{naira(r.amount)}</b></td>
                  {canManage && <td className="r"><button className="icon-btn" onClick={() => { deleteFile(r.fileUrl); setReceipts((p) => p.filter((x) => x.id !== r.id)); log('RECEIPT', `Deleted receipt "${r.title}"`); toast('Receipt deleted'); }}><Icon name="trash" size={14} /></button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination paged={paged} label="receipts" />
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Add receipt">
        <div className="field"><label className="label">Description</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Robe cleaning service" /></div>
        <div className="grid g2">
          <div className="field"><label className="label">Amount (₦)</label><input className="input" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="field"><label className="label">Category</label><select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{['Equipment', 'Maintenance', 'Materials', 'Events', 'Welfare', 'Other'].map((c) => <option key={c}>{c}</option>)}</select></div>
        </div>
        <label className="upload-drop" style={{ marginTop: 12 }}>
          <Icon name="upload" size={22} />
          <div style={{ minWidth: 0 }}>
            <b className="small" style={{ overflowWrap: 'anywhere' }}>{file ? file.name : 'Attach the receipt (optional)'}</b>
            <div className="muted tiny">{file ? sizeOf(file.size) : `Photo, PDF or scan · up to ${MAX_UPLOAD_MB} MB`}</div>
          </div>
          <input type="file" hidden accept={DOC_ACCEPT} onChange={pick} />
        </label>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button><button className="btn btn-pri" disabled={busy} onClick={save}>{busy ? 'Uploading…' : 'Save receipt'}</button></div>
      </Modal>
    </div>
  );
}