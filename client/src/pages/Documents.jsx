import React, { useState } from 'react';
import { TODAY, uid, fmtDate } from '../utils/helpers';
import { PERMS, rolesOf, ROLES } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';

const CATS = ['All', 'Constitution', 'Minutes', 'Receipts', 'Financial', 'Reports', 'Other'];

export default function Documents({ ctx }) {
  const { me, users, documents, setDocuments, log, toast, notify } = ctx;
  const canManage = PERMS.manageDocuments(me);
  const [cat, setCat] = useState('All');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'Constitution', version: '', desc: '' });
  const list = documents.filter((d) => cat === 'All' || d.category === cat);
  const constitution = documents.filter((d) => d.category === 'Constitution').sort((a, b) => (a.date < b.date ? 1 : -1));

  const save = () => {
    if (!form.title.trim()) return toast('Enter a document title', 'err');
    const roleAtTime = rolesOf(me).map((r) => ROLES[r].label).join(' + ');
    const ver = form.version || `v${documents.filter((d) => d.title === form.title).length + 1}.0`;
    setDocuments((p) => [{ id: uid('doc'), title: form.title, category: form.category, version: ver, date: TODAY, by: me.id, roleAtTime, desc: form.desc, size: (0.2 + Math.random() * 2).toFixed(1) + ' MB' }, ...p]);
    log('DOC', `Uploaded ${form.category} document "${form.title}" (${ver})`);
    if (form.category === 'Constitution') notify(`Constitution ${ver} uploaded — previous versions retained`);
    toast('Document uploaded'); setModal(false);
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Document Library</h2><p className="muted small">Constitution, minutes, receipts, financial & administrative records.</p></div>
        {canManage && <button className="btn btn-pri" onClick={() => setModal(true)}><Icon name="upload" size={15} /> Upload document</button>}
      </div>
      {constitution.length > 0 && (
        <div className="card" style={{ borderColor: '#e9a63a' }}>
          <div className="card-h"><h3>📜 Choir Constitution</h3><span className="chip sm">Current: {constitution[0].version}</span></div>
          <div className="stack sm-gap">
            {constitution.map((c, i) => (
              <div key={c.id} className="pref-row">
                <div><b className="small">{c.version} — {new Date(c.date + 'T00:00:00').getFullYear()}</b> <span className="muted tiny">· {fmtDate(c.date)} · uploaded by {users.find((u) => u.id === c.by)?.name} ({c.roleAtTime})</span>{i === 0 && <span className="chip sm" style={{ marginLeft: 6 }}>In force</span>}</div>
                <button className="btn btn-sm btn-soft" onClick={() => toast('Download started (demo)')}><Icon name="upload" size={12} /> Download</button>
              </div>
            ))}
          </div>
          <p className="muted tiny" style={{ marginTop: 8 }}>Previous versions are never overwritten — they remain accessible for reference.</p>
        </div>
      )}
      <div className="chip-row">{CATS.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
      <div className="card pad0">
        <table className="tbl">
          <thead><tr><th>Document</th><th>Category</th><th>Version</th><th>Uploaded by</th><th>Date</th><th className="r" /></tr></thead>
          <tbody>
            {list.map((d) => {
              const by = users.find((x) => x.id === d.by);
              return (
                <tr key={d.id}>
                  <td><b>{d.title}</b><div className="muted tiny">{d.desc}</div></td>
                  <td><span className="chip sm">{d.category}</span></td>
                  <td>{d.version}</td>
                  <td className="muted">{by?.name} <span className="act-tag" style={{ background: '#0d94881a', color: '#0d9488' }}>{d.roleAtTime}</span></td>
                  <td className="muted">{fmtDate(d.date)}</td>
                  <td className="r"><button className="btn btn-sm btn-soft" onClick={() => toast('Download started (demo)')}>Download</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.length && <EmptyState icon="file" text="No documents in this category." />}
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Upload document">
        <div className="field"><label className="label">Title</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Choir Constitution" /></div>
        <div className="grid g2">
          <div className="field"><label className="label">Category</label><select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATS.filter((c) => c !== 'All').map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label className="label">Version (optional)</label><input className="input" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="auto" /></div>
        </div>
        <div className="field"><label className="label">Description</label><input className="input" value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} /></div>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button><button className="btn btn-pri" onClick={save}>Upload</button></div>
      </Modal>
    </div>
  );
}