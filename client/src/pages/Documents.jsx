import React, { useState } from 'react';
import { TODAY, uid, fmtDate } from '../utils/helpers';
import { PERMS, rolesOf, ROLES } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import Pagination, { usePaged } from '../components/ui/Pagination';
import { uploadFile, openFile, sizeOf, MAX_UPLOAD_MB, DOC_ACCEPT } from '../services/files';

const CATS = ['All', 'Constitution', 'Minutes', 'Receipts', 'Financial', 'Reports', 'Other'];

export default function DocumentsPage({ ctx }) {
  const { me, users, documents, setDocuments, log, toast, notify } = ctx;
  const canManage = PERMS.manageDocuments(me);
  const [cat, setCat] = useState('All');
  const [modal, setModal] = useState(false);
  const blank = { title: '', category: 'Constitution', version: '', desc: '' };
  const [form, setForm] = useState(blank);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const list = documents.filter((d) => cat === 'All' || d.category === cat);
  const constitution = documents.filter((d) => d.category === 'Constitution').sort((a, b) => (a.date < b.date ? 1 : -1));
  const paged = usePaged(list, 10, cat);
  const versionsPaged = usePaged(constitution, 5);
  const openNew = () => { setForm(blank); setFile(null); setModal(true); };
  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) return toast(`File is larger than ${MAX_UPLOAD_MB} MB`, 'err');
    setFile(f);
    setForm((x) => ({ ...x, title: x.title || f.name.replace(/\.[^.]+$/, '') }));
  };
  const download = (d) => (d.fileUrl
    ? openFile(d.fileUrl, d.fileName).catch((e) => toast(e.message, 'err'))
    : toast('No file was attached to this record — it was added before uploads were stored', 'err'));
  const save = async () => {
    if (!form.title.trim()) return toast('Enter a document title', 'err');
    if (!file) return toast('Choose the file to upload', 'err');
    setBusy(true);
    let up;
    try { up = await uploadFile(file); } catch (e) { setBusy(false); return toast(e.message, 'err'); }
    setBusy(false);
    const roleAtTime = rolesOf(me).map((r) => ROLES[r].label).join(' + ');
    const ver = form.version || `v${documents.filter((d) => d.title === form.title).length + 1}.0`;
    setDocuments((p) => [{ id: uid('doc'), title: form.title, category: form.category, version: ver, date: TODAY, by: me.id, roleAtTime, desc: form.desc, size: sizeOf(up.size), fileUrl: up.id, fileName: up.name, mime: up.type }, ...p]);
    log('DOC', `Uploaded ${form.category} document "${form.title}" (${ver})`);
    if (form.category === 'Constitution') notify(`Constitution ${ver} uploaded — previous versions retained`);
    toast('Document uploaded'); setModal(false); setFile(null);
  };
  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Document Library</h2><p className="muted small">Constitution, minutes, receipts, financial & administrative records.</p></div>
        {canManage && <button className="btn btn-pri" onClick={openNew}><Icon name="upload" size={15} /> Upload document</button>}
      </div>
      {constitution.length > 0 && (
        <div className="card" style={{ borderColor: '#e9a63a' }}>
          <div className="card-h"><h3>📜 Choir Constitution</h3><span className="chip sm">Current: {constitution[0].version}</span></div>
          <div className="stack sm-gap">
            {versionsPaged.items.map((c) => (
              <div key={c.id} className="pref-row">
                <div><b className="small">{c.version} — {new Date(c.date + 'T00:00:00').getFullYear()}</b> <span className="muted tiny">· {fmtDate(c.date)} · uploaded by {users.find((u) => u.id === c.by)?.name} ({c.roleAtTime})</span>{c.id === constitution[0].id && <span className="chip sm" style={{ marginLeft: 6 }}>In force</span>}</div>
                <button className="btn btn-sm btn-soft" onClick={() => download(c)}><Icon name="upload" size={12} style={{ transform: 'rotate(180deg)' }} /> Download</button>
              </div>
            ))}
          </div>
          <Pagination paged={versionsPaged} label="versions" />
          <p className="muted tiny" style={{ marginTop: 8 }}>Previous versions are never overwritten — they remain accessible for reference.</p>
        </div>
      )}
      <div className="chip-row">{CATS.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
      <div className="card pad0">
        <table className="tbl">
          <thead><tr><th>Document</th><th>Category</th><th>Version</th><th>Uploaded by</th><th>Date</th><th className="r" /></tr></thead>
          <tbody>
            {paged.items.map((d) => {
              const by = users.find((x) => x.id === d.by);
              return (
                <tr key={d.id}>
                  <td><b>{d.title}</b><div className="muted tiny">{d.desc}</div></td>
                  <td><span className="chip sm">{d.category}</span></td>
                  <td>{d.version}</td>
                  <td className="muted">{by?.name} <span className="act-tag" style={{ background: '#0d94881a', color: '#0d9488' }}>{d.roleAtTime}</span></td>
                  <td className="muted">{fmtDate(d.date)}</td>
                  <td className="r"><button className="btn btn-sm btn-soft" onClick={() => download(d)}>{d.fileUrl ? 'Open' : 'No file'}</button>{d.size && <div className="muted tiny">{d.size}</div>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination paged={paged} label="documents" />
        {!list.length && <EmptyState icon="file" text="No documents in this category." />}
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Upload document">
        <div className="field"><label className="label">Title</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Choir Constitution" /></div>
        <div className="grid g2">
          <div className="field"><label className="label">Category</label><select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATS.filter((c) => c !== 'All').map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label className="label">Version (optional)</label><input className="input" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="auto" /></div>
        </div>
        <div className="field"><label className="label">Description</label><input className="input" value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} /></div>
        <label className="upload-drop" style={{ marginTop: 12 }}>
          <Icon name="upload" size={22} />
          <div style={{ minWidth: 0 }}>
            <b className="small" style={{ overflowWrap: 'anywhere' }}>{file ? file.name : 'Click to choose a file'}</b>
            <div className="muted tiny">{file ? sizeOf(file.size) : `PDF, Word, Excel, PowerPoint or image · up to ${MAX_UPLOAD_MB} MB`}</div>
          </div>
          <input type="file" hidden accept={DOC_ACCEPT} onChange={pick} />
        </label>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button><button className="btn btn-pri" disabled={busy} onClick={save}>{busy ? 'Uploading…' : 'Upload'}</button></div>
      </Modal>
    </div>
  );
}