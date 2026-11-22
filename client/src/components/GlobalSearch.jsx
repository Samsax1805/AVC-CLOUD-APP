import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './ui/Icon';
import { fmtDate } from '../utils/helpers';
import { PERMS, ROLES, participates } from '../hooks/usePermissions';

// The search box at the top: pages, members, songs, documents, minutes, announcements and voice notes,
// searched in what this member's browser already has. Choosing a result opens its page.
const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const GROUPS = [
  ['page', 'Pages', 'dashboard'],
  ['member', 'Members', 'users'],
  ['song', 'Music', 'music'],
  ['document', 'Documents', 'file'],
  ['minute', 'Minutes', 'file'],
  ['announcement', 'Announcements', 'bell'],
  ['voice', 'Voice notes', 'mic'],
];

export default function GlobalSearch({ ctx, nav, go }) {
  const { me, users = [], songs = [], documents = [], minutes = [], announcements = [], voiceNotes = [] } = ctx;
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const box = useRef(null);
  const input = useRef(null);

  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus(); setOpen(true); } };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key); };
  }, []);

  const canMembers = PERMS.manageMembers(me) || PERMS.approveMembers(me) || PERMS.addMembers(me);
  const results = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length || norm(q).length < 2) return [];
    const hit = (...fields) => { const text = norm(fields.join(' ')); return words.every((w) => text.includes(w)); };
    const starts = (t) => (norm(t).startsWith(words[0]) ? 0 : 1);
    const out = [];
    const add = (type, list) => out.push(...list.sort((a, b) => starts(a.title) - starts(b.title) || a.title.localeCompare(b.title)).slice(0, 5).map((r) => ({ ...r, type })));
    add('page', nav.filter((n) => hit(n.label)).map((n) => ({ id: n.id, title: n.label, sub: n.sec, page: n.id })));
    add('member', users.filter((u) => participates(u) || (canMembers && (u.status || 'active') === 'active')).filter((u) => hit(u.name, u.voice, canMembers ? u.email : ''))
      .map((u) => ({ id: u.id, title: u.name, sub: [u.voice, u.roles.filter((r) => r !== 'member' && ROLES[r]).map((r) => ROLES[r].label).join(', ') || (u.roles.includes('alumni') ? 'Old Member' : 'Member')].filter(Boolean).join(' · '), page: canMembers ? 'members' : null })));
    add('song', songs.filter((s) => hit(s.title, s.part, s.tag, (s.categories || []).join(' '))).map((s) => ({ id: s.id, title: s.title, sub: [s.part, s.tag].filter(Boolean).join(' · '), page: 'music' })));
    add('document', documents.filter((d) => hit(d.title, d.category, d.desc)).map((d) => ({ id: d.id, title: d.title, sub: [d.category, d.version && `v${d.version}`].filter(Boolean).join(' · '), page: 'documents' })));
    add('minute', minutes.filter((m) => hit(m.title, m.body)).map((m) => ({ id: m.id, title: m.title, sub: m.date ? fmtDate(m.date) : '', page: 'minutes' })));
    add('announcement', announcements.filter((a) => hit(a.title, a.body)).map((a) => ({ id: a.id, title: a.title, sub: a.date ? fmtDate(a.date) : '', page: 'announcements' })));
    add('voice', voiceNotes.filter((v) => hit(v.title, v.by)).map((v) => ({ id: v.id, title: v.title, sub: [v.by, v.date && fmtDate(v.date)].filter(Boolean).join(' · '), page: 'voice' })));
    return out;
  }, [q, nav, users, songs, documents, minutes, announcements, voiceNotes, canMembers]);

  useEffect(() => { setAt(0); }, [q]);
  const choose = (r) => { if (!r?.page) return; go(r.page); setOpen(false); setQ(''); input.current?.blur(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt((i) => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') choose(results[at]);
    if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
  };
  const showing = open && norm(q).length >= 2;

  return (
    <div className="gsearch" ref={box}>
      <div className="search-box navy">
        <Icon name="search" size={15} />
        <input ref={input} placeholder="Search anything…" value={q} aria-label="Search the choir site"
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey} />
        {q && <button className="gsearch-x" aria-label="Clear search" onClick={() => { setQ(''); input.current?.focus(); }}><Icon name="x" size={13} /></button>}
      </div>
      {showing && (
        <div className="gsearch-pop" role="listbox">
          {!results.length && <p className="gsearch-empty">Nothing found for “{q.trim()}”.</p>}
          {GROUPS.map(([type, label, icon]) => {
            const list = results.filter((r) => r.type === type);
            if (!list.length) return null;
            return (
              <div key={type} className="gsearch-group">
                <div className="gsearch-h">{label}</div>
                {list.map((r) => {
                  const i = results.indexOf(r);
                  return (
                    <button key={`${type}-${r.id}`} role="option" aria-selected={i === at} className={`gsearch-row ${i === at ? 'on' : ''} ${r.page ? '' : 'static'}`}
                      onMouseEnter={() => setAt(i)} onClick={() => choose(r)}>
                      <span className="gsearch-ic"><Icon name={icon} size={14} /></span>
                      <span className="gsearch-t"><b>{r.title}</b>{r.sub && <small>{r.sub}</small>}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
          <div className="gsearch-foot">↑ ↓ to move · Enter to open · Esc to close</div>
        </div>
      )}
    </div>
  );
}
