import React, { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import Icon from './ui/Icon';
import Avatar from './ui/Avatar';

const STATUS = { assigned: ['Waiting', '#d97706'], accepted: ['Accepted', '#0369a1'], declined: ["Can't do", '#dc2626'], done: ['Done', '#059669'], cancelled: ['Cancelled', '#64748b'] };
const when = (d) => new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const shortWhen = (d) => {
  const t = new Date(d); const now = new Date();
  return t.toDateString() === now.toDateString() ? t.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : t.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
};
const dueLabel = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : 'No date');
const PRIVATE_NOTE = 'Private · the choir admin can review chats';

// Keeps the newest messages in view as they arrive
const useScrollToEnd = (deps) => {
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return end;
};

function Header({ title, sub, onBack, onClose, avatar }) {
  return (
    <header className="duty-h">
      {onBack && <button className="icon-btn" onClick={onBack} aria-label="Back"><Icon name="back" size={18} /></button>}
      {avatar}
      <div style={{ flex: 1, minWidth: 0 }}><b className="duty-h-t">{title}</b><div className="duty-sub"><Icon name="lock" size={11} /> {sub}</div></div>
      <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
    </header>
  );
}

function Composer({ placeholder, busy, onSend }) {
  const [text, setText] = useState('');
  const submit = (e) => { e.preventDefault(); const t = text.trim(); if (!t || busy) return; setText(''); onSend(t); };
  return (
    <form className="duty-input" onSubmit={submit}>
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} aria-label="Message" placeholder={placeholder} />
      <button className="btn btn-pri" disabled={busy || !text.trim()}>Send</button>
    </form>
  );
}

// The duty assistant: officers type assignments, members reply
function AssistantThread({ onBack, onClose }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/assistant').then(({ data: d }) => setData(d)).catch(() => setError('Could not open the duty assistant.')); }, []);
  const end = useScrollToEnd([data]);
  const run = async (call) => {
    setBusy(true); setError('');
    try { const { data: d } = await call(); setData(d); } catch (e) { setError(e.response?.data?.msg || 'Message not sent. Please try again.'); } finally { setBusy(false); }
  };
  const say = (t) => run(() => api.post('/assistant', { text: t }));
  const act = (num, action) => run(() => api.post(`/assistant/duties/${num}/${action}`));
  const waiting = (data?.duties.mine || []).filter((d) => d.status === 'assigned' || d.status === 'accepted');
  return (<>
    <Header title="Duty assistant" sub={PRIVATE_NOTE} onBack={onBack} onClose={onClose} avatar={<span className="duty-bot-av"><Icon name="check" size={16} /></span>} />
    {waiting.length > 0 && (
      <div className="duty-waiting">
        {waiting.map((d) => (
          <div className="duty-card" key={d.id}>
            <div className="duty-card-t"><b>#{d.num} {d.title}</b><span className="muted tiny">{dueLabel(d.due)} · from {d.assignerName.split(' ')[0]}</span></div>
            <div className="duty-card-a">
              {d.status === 'assigned' && <button className="btn btn-sm btn-pri" disabled={busy} onClick={() => act(d.num, 'accept')}>Accept</button>}
              {d.status === 'assigned' && <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => act(d.num, 'decline')}>Can't</button>}
              <button className="btn btn-sm btn-soft" disabled={busy} onClick={() => act(d.num, 'done')}>Done</button>
            </div>
          </div>
        ))}
      </div>
    )}
    <div className="duty-msgs">
      {!data && !error && <p className="muted small" style={{ textAlign: 'center' }}>Opening…</p>}
      {data?.messages.map((m) => (
        <div key={m.id} className={`duty-msg ${m.from}`}><div className="duty-bubble">{m.text}</div><div className="duty-time">{when(m.createdAt)}</div></div>
      ))}
      {data && data.duties.given.length > 0 && (
        <details className="duty-given">
          <summary>Duties you gave out ({data.duties.given.length})</summary>
          {data.duties.given.map((d) => (
            <div className="duty-given-row" key={d.id}>
              <span>#{d.num} {d.title} → {d.assigneeName}</span>
              <span className="act-tag" style={{ background: STATUS[d.status][1] + '1a', color: STATUS[d.status][1] }}>{STATUS[d.status][0]}</span>
            </div>
          ))}
        </details>
      )}
      <div ref={end} />
    </div>
    {error && <p className="duty-err">{error}</p>}
    <div className="duty-quick">
      <button className="chip sm" onClick={() => say('my duties')}>My duties</button>
      {data?.canAssign && <button className="chip sm" onClick={() => say('open duties')}>Open duties</button>}
      <button className="chip sm" onClick={() => say('help')}>Help</button>
    </div>
    <Composer busy={busy} onSend={say} placeholder={data?.canAssign ? 'e.g. assign Grace to lead the offertory on Sunday' : 'e.g. accept 12 · done 12 · my duties'} />
  </>);
}

// A private conversation with one member; checks for new messages while it's open
function MemberThread({ userId, me, onBack, onClose }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const load = () => api.get(`/messages/with/${userId}`).then(({ data: d }) => live && setData(d)).catch(() => live && setError('Could not open this conversation.'));
    load();
    const t = setInterval(load, 8000);
    return () => { live = false; clearInterval(t); };
  }, [userId]);
  const end = useScrollToEnd([data?.messages.length]);
  const send = async (text) => {
    setBusy(true); setError('');
    try { const { data: d } = await api.post(`/messages/with/${userId}`, { text }); setData(d); } catch (e) { setError(e.response?.data?.msg || 'Message not sent. Please try again.'); } finally { setBusy(false); }
  };
  const who = data?.with;
  return (<>
    <Header title={who?.name || '…'} sub={PRIVATE_NOTE} onBack={onBack} onClose={onClose} avatar={who && <Avatar user={{ name: who.name, color: '#e9a63a' }} size={30} />} />
    <div className="duty-msgs">
      {!data && !error && <p className="muted small" style={{ textAlign: 'center' }}>Opening…</p>}
      {data && !data.messages.length && <p className="muted small duty-empty">Say hello to {who.name.split(' ')[0]} 👋<br />Only the two of you will see this conversation.</p>}
      {data?.messages.map((m) => (
        <div key={m.id} className={`duty-msg ${m.from === me.id ? 'user' : 'bot'}`}><div className="duty-bubble">{m.text}</div><div className="duty-time">{when(m.createdAt)}{m.from === me.id && m.read ? ' · Seen' : ''}</div></div>
      ))}
      <div ref={end} />
    </div>
    {error && <p className="duty-err">{error}</p>}
    {who && !who.active
      ? <p className="duty-err" style={{ color: 'var(--mut)', background: 'transparent' }}>{who.name} is no longer an active member, so you can't reply.</p>
      : <Composer busy={busy} onSend={send} placeholder={`Message ${who?.name.split(' ')[0] || ''}…`} />}
  </>);
}

// Conversations list, new message picker, and the threads above
export default function ChatPanel({ me }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('list'); // 'list' | 'new' | 'assistant' | member id
  const [list, setList] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [q, setQ] = useState('');
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (open) return undefined;
    const check = () => api.get('/messages/unread').then(({ data }) => setUnread(data.unread || 0)).catch(() => {});
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, [open]);
  useEffect(() => {
    if (!open || view !== 'list') return undefined;
    const load = () => api.get('/messages').then(({ data }) => setList(data)).catch(() => setList({ failed: true }));
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [open, view]);
  useEffect(() => {
    if (view === 'new' && !contacts) api.get('/messages/contacts').then(({ data }) => setContacts(data.contacts)).catch(() => setContacts([]));
  }, [view, contacts]);

  const close = () => { setOpen(false); setView('list'); setQ(''); };
  const back = () => { setView('list'); setQ(''); };
  const needle = q.trim().toLowerCase();
  const convos = (list?.conversations || []).filter((c) => !needle || c.name.toLowerCase().includes(needle));

  return (<>
    {!open && (
      <button className="duty-fab" onClick={() => setOpen(true)} aria-label={`Open messages${unread ? `, ${unread} unread` : ''}`}>
        <Icon name="bell" size={19} /><span className="duty-fab-l">Messages</span>
        {unread > 0 && <span className="duty-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
    )}
    {open && (
      <section className="duty-panel" role="dialog" aria-label="Messages">
        {view === 'assistant' && <AssistantThread onBack={back} onClose={close} />}
        {view !== 'assistant' && view !== 'list' && view !== 'new' && <MemberThread key={view} userId={view} me={me} onBack={back} onClose={close} />}
        {(view === 'list' || view === 'new') && (<>
          <Header title={view === 'new' ? 'New message' : 'Messages'} sub={PRIVATE_NOTE} onBack={view === 'new' ? back : null} onClose={close} />
          <div className="chat-search">
            <Icon name="search" size={14} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={view === 'new' ? 'Search members…' : 'Search conversations…'} aria-label="Search" />
            {view === 'list' && <button className="btn btn-sm btn-pri" onClick={() => { setView('new'); setQ(''); }}><Icon name="plus" size={13} /> New</button>}
          </div>
          <div className="chat-list">
            {view === 'list' && (<>
              {!needle && (
                <button className="chat-item" onClick={() => setView('assistant')}>
                  <span className="duty-bot-av"><Icon name="check" size={16} /></span>
                  <span className="chat-item-main"><b>Duty assistant</b><span className="muted tiny">Duties and psalmist reminders</span></span>
                  {list?.assistantUnread > 0 && <span className="chat-unread">{list.assistantUnread}</span>}
                </button>
              )}
              {!list && <p className="muted small duty-empty">Loading…</p>}
              {list?.failed && <p className="muted small duty-empty">Messages could not be loaded.</p>}
              {convos.map((c) => (
                <button key={c.userId} className={`chat-item ${c.unread ? 'unread' : ''}`} onClick={() => setView(c.userId)}>
                  <Avatar user={{ name: c.name, color: '#1a2c60' }} size={34} />
                  <span className="chat-item-main"><b>{c.name}</b><span className="muted tiny chat-preview">{c.last.from === me.id ? 'You: ' : ''}{c.last.text}</span></span>
                  <span className="chat-item-side"><span className="muted tiny">{shortWhen(c.last.createdAt)}</span>{c.unread > 0 && <span className="chat-unread">{c.unread}</span>}</span>
                </button>
              ))}
              {list && !list.failed && !convos.length && <p className="muted small duty-empty">{needle ? 'No conversations match.' : 'No conversations yet. Tap New to message a member privately.'}</p>}
            </>)}
            {view === 'new' && (<>
              {!contacts && <p className="muted small duty-empty">Loading members…</p>}
              {contacts?.filter((c) => !needle || c.name.toLowerCase().includes(needle)).map((c) => (
                <button key={c.id} className="chat-item" onClick={() => { setView(c.id); setQ(''); }}>
                  <Avatar user={{ name: c.name, color: '#1a2c60' }} size={34} />
                  <span className="chat-item-main"><b>{c.name}</b><span className="muted tiny">{c.part || 'Member'}</span></span>
                </button>
              ))}
            </>)}
          </div>
        </>)}
      </section>
    )}
  </>);
}
