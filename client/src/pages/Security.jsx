import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { ROLES } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Modal from '../components/ui/Modal';
import StatCard from '../components/ui/StatCard';
import EmptyState from '../components/ui/EmptyState';
import Pagination, { usePaged } from '../components/ui/Pagination';

// What each server-recorded event means, and its colour
export const EVENT = {
  success: ['Signed in', '#059669'], wrong_password: ['Wrong password', '#d97706'], unknown_account: ['Unknown email', '#64748b'],
  locked: ['Account locked', '#dc2626'], blocked: ['Blocked while locked', '#dc2626'], pending: ['Awaiting approval', '#64748b'],
  deactivated: ['Deactivated account', '#9f1239'],
  member_added: ['Member added', '#059669'], member_approved: ['Member approved', '#059669'], member_rejected: ['Registration rejected', '#dc2626'],
  member_deactivated: ['Member deactivated', '#9f1239'], member_reactivated: ['Member reactivated', '#047857'], part_changed: ['Part changed', '#0369a1'],
  role_granted: ['Role granted', '#d97706'], role_revoked: ['Role removed', '#b45309'], password_reset: ['Password reset', '#7c3aed'],
  password_changed: ['Password changed', '#7c3aed'], signed_out_everywhere: ['Signed out everywhere', '#1a2c60'], unlocked: ['Account unlocked', '#047857'],
  roster_published: ['Psalmist roster published', '#9d174d'], roster_unpublished: ['Psalmist roster unpublished', '#64748b'], roster_imported: ['Psalmist roster imported', '#9d174d'],
};
export const METHOD = { google: 'Google', password: 'Password', reset: 'Password reset' };
const FAILED = ['wrong_password', 'unknown_account', 'locked', 'blocked'];
const DUTY = { assigned: ['Waiting', '#d97706'], accepted: ['Accepted', '#0369a1'], declined: ["Can't do", '#dc2626'], done: ['Done', '#059669'], cancelled: ['Cancelled', '#64748b'] };
export const when = (d) => (d ? new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never');
export const Tag = ({ type }) => {
  const [label, color] = EVENT[type] || [type, '#64748b'];
  return <span className="act-tag" style={{ background: color + '1a', color }}>{label}</span>;
};
const roleChips = (roles) => roles.filter((r) => ROLES[r] && r !== 'member').map((r) => (
  <span key={r} className="act-tag" style={{ background: ROLES[r].bg, color: ROLES[r].color }}>{ROLES[r].label}</span>
));
const Dot = ({ color, icon }) => <span className="notif-ic" style={{ background: color + '1a', color }}><Icon name={icon} size={14} /></span>;

// Admin only: private messages between members, every duty, and every duty-assistant conversation
function ChatLogs() {
  const [dms, setDms] = useState(null);
  const [pair, setPair] = useState('');
  useEffect(() => { api.get('/messages/logs').then(({ data }) => { setDms(data.threads); setPair(data.threads[0]?.pair || ''); }).catch(() => setDms([])); }, []);
  const t = dms?.find((x) => x.pair === pair);
  return (
    <div className="card">
      <div className="card-h" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h3>Private messages</h3>
        {dms?.length > 0 && (
          <select className="input sm" aria-label="Conversation" value={pair} onChange={(e) => setPair(e.target.value)}>
            {dms.map((x) => <option key={x.pair} value={x.pair}>{x.names.join(' ↔ ')} ({x.messages.length})</option>)}
          </select>
        )}
      </div>
      {!dms && <p className="muted small" style={{ margin: 0 }}>Loading…</p>}
      {t ? (
        <div className="log-thread">
          {t.messages.map((m) => (
            <div key={m.id} className={`duty-msg ${m.fromName === t.names[0] ? 'bot' : 'user'}`}>
              <div className="duty-bubble">{m.text}</div>
              <div className="duty-time">{m.fromName} · {when(m.createdAt)}{m.read ? ' · read' : ''}</div>
            </div>
          ))}
        </div>
      ) : dms && <EmptyState icon="lock" text="No private messages yet." />}
    </div>
  );
}

function DutyLogs() {
  const [logs, setLogs] = useState(null);
  const [who, setWho] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => { api.get('/assistant/logs').then(({ data }) => { setLogs(data); setWho(data.threads[0]?.userId || ''); }).catch(() => setFailed(true)); }, []);
  const dutyPage = usePaged(logs?.duties || [], 10);
  if (failed) return <div className="card"><p className="small" style={{ margin: 0 }}>Duty chats could not be loaded.</p></div>;
  if (!logs) return <div className="card"><p className="muted small" style={{ margin: 0 }}>Loading…</p></div>;
  const thread = logs.threads.find((t) => t.userId === who);
  return (<>
    <div className="card">
      <div className="card-h"><h3>Duties</h3><span className="chip sm">{logs.duties.length}</span></div>
      <div className="feed">
        {dutyPage.items.map((d) => (
          <div className="feed-row" key={d.id}>
            <Dot color={DUTY[d.status][1]} icon="check" />
            <div className="feed-txt"><b>#{d.num} {d.title}</b> <span className="act-tag" style={{ background: DUTY[d.status][1] + '1a', color: DUTY[d.status][1] }}>{DUTY[d.status][0]}</span>
              <div className="muted small">{d.assigneeName} · given by {d.assignerName}{d.due ? ` · due ${d.due}` : ''}</div>
            </div>
            <span className="muted tiny">{when(d.updatedAt)}</span>
          </div>
        ))}
      </div>
      {!logs.duties.length && <EmptyState icon="check" text="No duties given out yet." />}
      <Pagination paged={dutyPage} label="duties" />
    </div>
    <div className="card">
      <div className="card-h" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h3>Duty assistant conversations</h3>
        {logs.threads.length > 0 && (
          <select className="input sm" aria-label="Conversation" value={who} onChange={(e) => setWho(e.target.value)}>
            {logs.threads.map((t) => <option key={t.userId} value={t.userId}>{t.name} ({t.messages.length})</option>)}
          </select>
        )}
      </div>
      {thread ? (
        <div className="log-thread">
          {thread.messages.map((m) => (
            <div key={m.id} className={`duty-msg ${m.from}`}>
              <div className="duty-bubble">{m.text}</div>
              <div className="duty-time">{m.from === 'user' ? thread.name : 'Assistant'} · {when(m.createdAt)}</div>
            </div>
          ))}
        </div>
      ) : <EmptyState icon="lock" text="Nobody has used the duty assistant yet." />}
    </div>
  </>);
}

export default function SecurityPage({ ctx }) {
  const { me, toast } = ctx;
  const isAdmin = me.roles.includes('admin');
  const TABS = [['overview', 'Overview'], ['signins', 'Sign-in activity'], ['accounts', 'Accounts'], ['changes', 'Change log'], ...(isAdmin ? [['duties', 'Chats']] : [])];
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [who, setWho] = useState('all');
  const [result, setResult] = useState('all');
  const [pickMember, setPickMember] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/security').then(({ data: d }) => { setData(d); setFailed(false); }).catch(() => setFailed(true));
  useEffect(() => { load(); }, []);

  const events = data?.events || [];
  const signins = events.filter((e) => e.kind === 'signin');
  const actions = events.filter((e) => e.kind === 'action');
  const shown = signins.filter((e) => (who === 'all' || (e.userId || e.email) === who)
    && (result === 'all' || (result === 'ok' ? e.type === 'success' : FAILED.includes(e.type))));
  const signinPage = usePaged(shown, 15, `${who}|${result}`);
  const actionPage = usePaged(actions, 15);
  const people = [...new Map(signins.map((e) => [e.userId || e.email, e.name || e.email])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));

  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const dayAgo = Date.now() - 864e5;
  const monthAgo = Date.now() - 30 * 864e5;
  const alerts = events.filter((e) => e.alert && new Date(e.createdAt) > monthAgo).slice(0, 8);
  const canSignOut = (u) => u.id !== me.id && (isAdmin || !u.roles.includes('admin'));

  const act = async () => {
    const { action, user } = confirm;
    setBusy(true);
    try {
      await api.post(`/security/users/${user.id}/${action}`);
      toast(action === 'signout' ? `${user.name} has been signed out on every device` : `${user.name} can sign in again`);
      setConfirm(null); setPickMember('');
      load();
    } catch (e) { toast(e.response?.data?.msg || 'That did not work — please try again', 'err'); } finally { setBusy(false); }
  };

  const head = (
    <div className="page-head">
      <div><h2>Security</h2><p className="muted small">Sign-ins and sensitive changes, recorded by the server so they can't be edited. Kept for 90 days.</p></div>
      <button className="btn btn-soft" onClick={load}><Icon name="clock" size={14} /> Refresh</button>
    </div>
  );
  if (failed) return <div className="stack">{head}<div className="card"><p className="small" style={{ margin: 0 }}>Security records could not be loaded. <button className="btn btn-sm btn-soft" onClick={load}>Try again</button></p></div></div>;
  if (!data) return <div className="stack">{head}<p className="muted small">Loading…</p></div>;

  return (
    <div className="stack dash">
      {head}
      <div className="tab-row" role="tablist">
        {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{label}{id === 'overview' && alerts.length > 0 && <span className="tab-dot" />}</button>)}
      </div>

      {tab === 'overview' && (<>
        <div className="grid g4 stat-grid">
          <StatCard icon="check" label="Sign-ins today" value={signins.filter((e) => e.type === 'success' && new Date(e.createdAt) >= midnight).length} tone="#059669" />
          <StatCard icon="x" label="Failed sign-ins" sub="last 24 hours" value={signins.filter((e) => FAILED.includes(e.type) && new Date(e.createdAt) > dayAgo).length} tone="#d97706" />
          <StatCard icon="lock" label="Locked accounts" value={data.locked.length} tone="#dc2626" />
          <StatCard icon="shield" label="Officer accounts" value={data.officers.length} tone="#1a2c60" />
        </div>
        <div className="card" style={alerts.length ? { borderColor: '#dc2626' } : undefined}>
          <div className="card-h"><h3>Alerts</h3><span className="chip sm">Last 30 days</span></div>
          {alerts.length ? (
            <div className="feed">
              {alerts.map((e) => (
                <div className="feed-row" key={e.id}>
                  <Dot color="#dc2626" icon="shield" />
                  <div className="feed-txt"><b>{e.name || e.email}</b> · <Tag type={e.type} /><div className="muted small">{e.detail}{e.device ? ` · ${e.device}` : ''}</div></div>
                  <span className="muted tiny">{when(e.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : <p className="muted small" style={{ margin: 0 }}>No alerts in the last 30 days. Locked accounts, new admins, password resets and Admin/President sign-ins from a new device appear here.</p>}
        </div>
        {data.locked.length > 0 && (
          <div className="card">
            <div className="card-h"><h3>Locked accounts</h3></div>
            <div className="feed">
              {data.locked.map((u) => (
                <div className="feed-row" key={u.id} style={{ alignItems: 'center' }}>
                  <div className="feed-txt"><b>{u.name}</b><div className="muted small">{u.email} · locked until {when(u.lockedUntil)}</div></div>
                  <button className="btn btn-sm btn-soft" onClick={() => setConfirm({ action: 'unlock', user: u })}>Unlock</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </>)}

      {tab === 'signins' && (
        <div className="card">
          <div className="card-h" style={{ flexWrap: 'wrap', gap: 8 }}>
            <h3>Sign-in activity</h3>
            <div className="chip-row">
              <select className="input sm" aria-label="Member" value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="all">Everyone</option>
                {people.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select>
              <select className="input sm" aria-label="Result" value={result} onChange={(e) => setResult(e.target.value)}>
                <option value="all">All results</option><option value="ok">Successful</option><option value="failed">Failed</option>
              </select>
            </div>
          </div>
          <div className="feed">
            {signinPage.items.map((e) => (
              <div className="feed-row" key={e.id}>
                <Dot color={EVENT[e.type]?.[1] || '#64748b'} icon={e.type === 'success' ? 'check' : 'x'} />
                <div className="feed-txt"><b>{e.name || e.email || 'Unknown'}</b> · <Tag type={e.type} />
                  <div className="muted small">{[METHOD[e.method], e.device, e.ip && `network ${e.ip}`].filter(Boolean).join(' · ')}</div>
                </div>
                <span className="muted tiny">{when(e.createdAt)}</span>
              </div>
            ))}
          </div>
          {!shown.length && <EmptyState icon="shield" text={signins.length ? 'No sign-ins match these filters.' : 'No sign-ins recorded yet.'} />}
          <Pagination paged={signinPage} label="sign-ins" />
        </div>
      )}

      {tab === 'accounts' && (<>
        <div className="card">
          <div className="card-h"><h3>Officer accounts</h3><span className="chip sm">{data.officers.length}</span></div>
          <div className="feed">
            {data.officers.map((u) => (
              <div className="feed-row" key={u.id} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="feed-txt" style={{ minWidth: 180 }}><b>{u.name}</b> {roleChips(u.roles)}
                  <div className="muted small">Last sign-in {when(u.lastLoginAt)} · signs in with {u.methods.join(' or ') || 'nothing set up yet'}{u.lockedUntil ? ' · locked' : ''}</div>
                </div>
                {canSignOut(u) && <button className="btn btn-sm btn-ghost" onClick={() => setConfirm({ action: 'signout', user: u })}><Icon name="logout" size={13} /> Sign out everywhere</button>}
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h3>Sign a member out everywhere</h3></div>
          <p className="muted small" style={{ marginTop: 0 }}>For a lost or stolen phone: every device signed in to that account is signed out. They can sign straight back in on their own device.</p>
          <div className="chip-row">
            <select className="input sm" aria-label="Member to sign out" value={pickMember} onChange={(e) => setPickMember(e.target.value)} style={{ minWidth: 200 }}>
              <option value="">Choose a member…</option>
              {data.members.filter(canSignOut).sort((a, b) => a.name.localeCompare(b.name)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <button className="btn btn-sm btn-soft" disabled={!pickMember} onClick={() => setConfirm({ action: 'signout', user: data.members.find((u) => u.id === pickMember) })}>Sign out everywhere</button>
          </div>
        </div>
      </>)}

      {tab === 'changes' && (
        <div className="card">
          <div className="card-h"><h3>Change log</h3></div>
          <div className="feed">
            {actionPage.items.map((e) => (
              <div className="feed-row" key={e.id}>
                <Dot color="#1a2c60" icon="shield" />
                <div className="feed-txt"><b>{e.name || e.email}</b> · <Tag type={e.type} /><div className="muted small">{e.detail}{e.actorName && e.actorId !== e.userId ? ` · by ${e.actorName}` : ''}</div></div>
                <span className="muted tiny">{when(e.createdAt)}</span>
              </div>
            ))}
          </div>
          {!actions.length && <EmptyState icon="shield" text="No changes recorded yet. Members added, approved or deactivated, role and part changes, and password resets appear here." />}
          <Pagination paged={actionPage} label="changes" />
        </div>
      )}

      {tab === 'duties' && isAdmin && (<>
        <p className="muted small" style={{ margin: 0 }}>Only the admin can see this tab. Members are told their chats are private and that the admin can review them.</p>
        <ChatLogs />
        <DutyLogs />
      </>)}

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.action === 'unlock' ? 'Unlock account' : 'Sign out everywhere'}>
        {confirm?.action === 'signout' && <p className="small">Sign <b>{confirm.user.name}</b> out on every device? Anyone using their account is logged out at once. They can sign back in with their password or Google.</p>}
        {confirm?.action === 'unlock' && <p className="small">Let <b>{confirm.user.name}</b> try their password again now, instead of waiting for the lock to end?</p>}
        <div className="modal-foot"><button className="btn btn-ghost" onClick={() => setConfirm(null)}>Cancel</button><button className="btn btn-pri" disabled={busy} onClick={act}>Confirm</button></div>
      </Modal>
    </div>
  );
}
