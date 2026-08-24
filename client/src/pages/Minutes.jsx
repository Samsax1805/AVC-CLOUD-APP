import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TODAY, uid, fmtDate } from '../utils/helpers';
import { PERMS, rolesOf, ROLES } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Modal from '../components/ui/Modal';

export default function Minutes({ ctx }) {
  const { me, users, minutes, setMinutes, log, toast } = ctx;
  const canEdit = PERMS.manageMinutes(me);
  const [openId, setOpenId] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ title: '', body: '' });

  const save = () => {
    if (!form.title.trim() || !form.body.trim()) return toast('Title and content are required', 'err');
    if (modal.mode === 'new') {
      setMinutes((p) => [{ id: uid('m'), title: form.title, body: form.body, date: TODAY, by: me.id, roleAtTime: rolesOf(me).map((r) => ROLES[r].label).join(' + ') }, ...p]);
      log('MINUTES', `Published minutes: "${form.title}"`); toast('Minutes published');
    } else {
      setMinutes((p) => p.map((m) => (m.id === modal.doc.id ? { ...m, title: form.title, body: form.body } : m)));
      log('MINUTES', `Edited minutes: "${form.title}"`); toast('Minutes updated');
    }
    setModal(null);
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Meeting Minutes</h2><p className="muted small">{canEdit ? 'Record and publish minutes for the choir.' : 'Read-only archive of all meetings.'}</p></div>
        {canEdit && <button className="btn btn-pri" onClick={() => { setForm({ title: '', body: '' }); setModal({ mode: 'new' }); }}><Icon name="plus" size={15} /> New minutes</button>}
      </div>
      <div className="stack">
        {minutes.map((m) => {
          const by = users.find((x) => x.id === m.by);
          const open = openId === m.id;
          return (
            <div className="card min-card" key={m.id}>
              <div className="min-head">
                <div className="min-ic"><Icon name="file" size={18} /></div>
                <div style={{ flex: 1 }}>
                  <div className="min-title">{m.title}</div>
                  <div className="muted small">{fmtDate(m.date)} · recorded by {by?.name}{m.roleAtTime && <span className="act-tag" style={{ background: '#0284c71a', color: '#0284c7', marginLeft: 6 }}>{m.roleAtTime}</span>}</div>
                </div>
                <div className="head-actions">
                  {canEdit && <>
                    <button className="btn btn-sm btn-soft" onClick={() => { setForm({ title: m.title, body: m.body }); setModal({ mode: 'edit', doc: m }); }}><Icon name="edit" size={13} /></button>
                    <button className="btn btn-sm btn-danger-soft" onClick={() => { setMinutes((p) => p.filter((x) => x.id !== m.id)); log('MINUTES', `Deleted minutes "${m.title}"`); toast('Minutes deleted'); }}><Icon name="trash" size={13} /></button>
                  </>}
                  <button className="btn btn-sm btn-ghost" onClick={() => setOpenId(open ? null : m.id)}>{open ? 'Hide' : 'Read'}</button>
                </div>
              </div>
              <AnimatePresence>
                {open && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="min-body"><p>{m.body}</p></motion.div>}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === 'new' ? 'New minutes' : 'Edit minutes'} wide>
        <div className="field"><label className="label">Meeting title</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Monthly General Meeting — August 2026" /></div>
        <div className="field"><label className="label">Minutes content</label><textarea className="input area" rows={7} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Write the minutes here…" /></div>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-pri" onClick={save}>Publish</button></div>
      </Modal>
    </div>
  );
}