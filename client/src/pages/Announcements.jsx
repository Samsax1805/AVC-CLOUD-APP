import React, { useState } from 'react';
import { TODAY, uid, fmtDate } from '../utils/helpers';
import { PERMS, rolesOf, ROLES } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';

export default function Announcements({ ctx }) {
  const { me, users, announcements, setAnnouncements, log, toast, notify } = ctx;
  const canManage = PERMS.manageAnnouncements(me);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ title: '', body: '' });

  const save = () => {
    if (!form.title.trim() || !form.body.trim()) return toast('Title and message are required', 'err');
    const roleAtTime = rolesOf(me).map((r) => ROLES[r].label).join(' + ');
    if (modal?.mode === 'edit') {
      setAnnouncements((p) => p.map((a) => (a.id === modal.doc.id ? { ...a, title: form.title, body: form.body } : a)));
      log('ANNOUNCE', `Edited announcement "${form.title}"`); toast('Announcement updated');
    } else {
      setAnnouncements((p) => [{ id: uid('an'), title: form.title, body: form.body, by: me.id, roleAtTime, date: TODAY, pinned: false }, ...p]);
      log('ANNOUNCE', `Posted announcement "${form.title}"`); notify(`New announcement: ${form.title}`); toast('Announcement posted to all choristers');
    }
    setModal(null);
  };
  const list = [...announcements].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Announcements</h2><p className="muted small">Official notices for all choristers.</p></div>
        {canManage && <button className="btn btn-pri" onClick={() => { setForm({ title: '', body: '' }); setModal({ mode: 'new' }); }}><Icon name="plus" size={15} /> New announcement</button>}
      </div>
      <div className="stack">
        {list.map((a) => {
          const by = users.find((x) => x.id === a.by);
          return (
            <div className="card" key={a.id} style={a.pinned ? { borderColor: '#e9a63a', background: '#fdf6e6' } : {}}>
              <div className="min-head">
                <div className="min-ic"><Icon name="bell" size={18} /></div>
                <div style={{ flex: 1 }}>
                  <div className="min-title">{a.title} {a.pinned && <span className="chip sm" style={{ marginLeft: 6 }}>📌 Pinned</span>}</div>
                  <div className="muted small">{fmtDate(a.date)} · {by?.name} <span className="act-tag" style={{ background: '#e9a63a1a', color: '#d18f26' }}>{a.roleAtTime}</span></div>
                </div>
                {canManage && (
                  <div className="head-actions">
                    <button className="btn btn-sm btn-soft" onClick={() => { setAnnouncements((p) => p.map((x) => (x.id === a.id ? { ...x, pinned: !x.pinned } : x))); toast(a.pinned ? 'Unpinned' : 'Pinned to top'); }}><Icon name="check" size={13} /></button>
                    <button className="btn btn-sm btn-soft" onClick={() => { setForm({ title: a.title, body: a.body }); setModal({ mode: 'edit', doc: a }); }}><Icon name="edit" size={13} /></button>
                    <button className="btn btn-sm btn-danger-soft" onClick={() => { setAnnouncements((p) => p.filter((x) => x.id !== a.id)); log('ANNOUNCE', `Deleted announcement "${a.title}"`); toast('Announcement deleted'); }}><Icon name="trash" size={13} /></button>
                  </div>
                )}
              </div>
              <p className="small" style={{ marginTop: 12, lineHeight: 1.7 }}>{a.body}</p>
            </div>
          );
        })}
        {!list.length && <EmptyState icon="bell" text="No announcements yet." />}
      </div>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === 'edit' ? 'Edit announcement' : 'New announcement'}>
        <div className="field"><label className="label">Title</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div className="field"><label className="label">Message</label><textarea className="input area" rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-pri" onClick={save}>Publish</button></div>
      </Modal>
    </div>
  );
}