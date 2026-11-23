import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Icon from '../components/ui/Icon';
import Avatar from '../components/ui/Avatar';
import { lira, fmtDate } from '../utils/helpers';
import { ROLES, participates, isAlumni } from '../hooks/usePermissions';
import { EVENT_TYPES, SetlistSongs, todayStr, shortDay, longDay } from './Calendar';

// Everything about me in one place: attendance, dues, debts, probation, my next duties and this week's songs.
const TYPE_LABEL = { weekly: 'Weekly dues', absence: 'Absence dues', lateness: 'Lateness dues' };
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const STATUS = { present: ['Present', '#059669'], late: ['Late', '#e0862c'], absent: ['Absent', '#dc2626'], excused: ['Excused', '#d97706'] };

export default function MyAccount({ ctx }) {
  const { me: meCtx, users = [], sessions = [], dues = [], debts = [], probations = [], songs = [], playId, togglePlay, setPage } = ctx;
  const me = users.find((u) => u.id === meCtx.id) || meCtx;
  const [cal, setCal] = useState(null);
  useEffect(() => { api.get('/calendar', { params: { from: todayStr(), to: addDays(todayStr(), 60) } }).then(({ data }) => setCal(data)).catch(() => setCal({ events: [], setlists: [], psalmists: [] })); }, []);
  const songById = useMemo(() => Object.fromEntries(songs.map((s) => [s.id, s])), [songs]);
  const takesPart = participates(me);

  // Attendance: sessions where I was marked, newest first
  const att = useMemo(() => sessions.map((s) => ({ date: s.date, title: s.title, st: s.records?.[me.id] })).filter((x) => x.st).sort((a, b) => b.date.localeCompare(a.date)), [sessions, me.id]);
  const rate = (list) => (list.length ? Math.round((list.filter((x) => x.st === 'present').length / list.length) * 100) : null);
  const last10 = att.slice(0, 10);
  // Money
  const year = String(new Date().getFullYear());
  const myDues = dues.filter((d) => d.memberId === me.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const duesYear = myDues.filter((d) => String(d.date || d.period || '').startsWith(year));
  const byType = duesYear.reduce((m, d) => { m[d.type || 'weekly'] = (m[d.type || 'weekly'] || 0) + (+d.amount || 0); return m; }, {});
  const myDebts = debts.filter((d) => d.memberId === me.id);
  const owing = myDebts.reduce((a, d) => a + Math.max(0, (+d.amount || 0) - (+d.paid || 0)), 0);
  const openDebts = myDebts.filter((d) => (+d.amount || 0) - (+d.paid || 0) > 0);
  const probation = probations.find((p) => p.memberId === me.id && p.status === 'active');
  // What's next
  const duty = (cal?.psalmists || []).filter((p) => p.people.some((q) => q.id === me.id)).sort((a, b) => a.date.localeCompare(b.date))[0];
  const nextEvents = (cal?.events || []).filter((e) => e.date >= todayStr()).slice(0, 4);
  const nextSet = (cal?.setlists || []).filter((s) => s.published && s.date >= todayStr()).sort((a, b) => a.date.localeCompare(b.date))[0];
  const roles = (me.roles || []).filter((r) => r !== 'member' && ROLES[r]);

  return (
    <div className="stack acct">
      <div className="card acct-head">
        <Avatar user={me} size={64} />
        <div className="acct-who">
          <h2>{me.name}</h2>
          <div className="chip-row wrap">
            {me.voice && <span className="chip sm">{me.voice}</span>}
            {roles.length ? roles.map((r) => <span key={r} className="role-badge small" style={{ background: ROLES[r].bg, color: ROLES[r].color }}>{ROLES[r].label}</span>) : <span className="chip sm">Member</span>}
            {me.joined && <span className="muted tiny">Member since {fmtDate(me.joined)}</span>}
          </div>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={() => setPage('profile')}><Icon name="edit" size={12} /> Edit my details</button>
      </div>

      {probation && (
        <div className="card acct-alert"><Icon name="clock" size={16} /><div><b>You are on probation</b>{probation.end ? ` until ${fmtDate(probation.end)}` : ''}.<div className="small">{probation.reason}</div></div></div>
      )}
      {isAlumni(me) && <div className="card acct-alert soft"><Icon name="user" size={16} /><div><b>Old Member</b><div className="small">You can follow the choir's news. Attendance, dues and elections are for active members.</div></div></div>}

      <div className="acct-grid">
        {takesPart && (
          <div className="card acct-card">
            <div className="card-h"><h3>Attendance</h3><button className="link-btn" onClick={() => setPage('attendance')}>Open</button></div>
            <div className="acct-big"><b>{rate(last10) ?? '–'}{rate(last10) !== null && '%'}</b><span>present in your last {last10.length || 0} sessions</span></div>
            <div className="acct-strip" aria-label="Your last sessions, oldest to newest">
              {[...last10].reverse().map((x) => <i key={x.date} title={`${fmtDate(x.date)}: ${STATUS[x.st]?.[0] || x.st}`} style={{ background: STATUS[x.st]?.[1] || '#94a3b8' }} />)}
              {!last10.length && <span className="muted tiny">No sessions recorded yet.</span>}
            </div>
            {att.length > 0 && <p className="muted tiny">Overall: {rate(att)}% present across {att.length} sessions. Late, absent and excused don't count as present.</p>}
          </div>
        )}

        {takesPart && (
          <div className="card acct-card">
            <div className="card-h"><h3>My dues in {year}</h3></div>
            <div className="acct-big"><b>{lira(Object.values(byType).reduce((a, b) => a + b, 0))}</b><span>paid this year</span></div>
            <div className="acct-lines">
              {Object.entries(byType).map(([t, v]) => <div key={t}><span>{TYPE_LABEL[t] || t}</span><b>{lira(v)}</b></div>)}
              {!duesYear.length && <span className="muted tiny">No payments recorded this year.</span>}
            </div>
            {myDues[0] && <p className="muted tiny">Last payment: {lira(myDues[0].amount)} on {fmtDate(myDues[0].date)}{myDues[0].period ? ` (for ${myDues[0].period})` : ''}.</p>}
          </div>
        )}

        <div className="card acct-card">
          <div className="card-h"><h3>Debts</h3><button className="link-btn" onClick={() => setPage('debts')}>Open</button></div>
          <div className="acct-big"><b style={{ color: owing ? '#dc2626' : '#059669' }}>{lira(owing)}</b><span>{owing ? 'still owing' : 'nothing owing'}</span></div>
          <div className="acct-lines">
            {openDebts.slice(0, 4).map((d) => <div key={d.id}><span>{d.desc}</span><b>{lira((+d.amount || 0) - (+d.paid || 0))}</b></div>)}
          </div>
        </div>

        <div className="card acct-card">
          <div className="card-h"><h3>Coming up</h3><button className="link-btn" onClick={() => setPage('calendar')}>Calendar</button></div>
          {!cal ? <p className="muted small">Loading…</p> : (
            <div className="stack xs-gap">
              {duty && <div className="acct-duty"><Icon name="mic" size={14} /><span><b>You're the psalmist</b> on {longDay(duty.date)}{duty.title ? ` (${duty.title})` : ''}</span></div>}
              {nextEvents.map((e) => <div key={e.id} className="acct-ev"><i style={{ background: EVENT_TYPES[e.type]?.color }} /><span><b>{shortDay(e.date)}</b> {e.start && `${e.start} `}{e.title}{e.place ? ` · ${e.place}` : ''}</span></div>)}
              {!duty && !nextEvents.length && <p className="muted small">Nothing planned in the next two months yet.</p>}
            </div>
          )}
        </div>
      </div>

      {nextSet && (
        <div className="card">
          <div className="card-h"><h3>Songs for {longDay(nextSet.date)}{nextSet.title ? `: ${nextSet.title}` : ''}</h3><span className="muted tiny">{me.voice ? `${me.voice} parts are marked` : ''}</span></div>
          <SetlistSongs setlist={nextSet} songById={songById} me={me} playId={playId} togglePlay={togglePlay} />
          {nextSet.notes && <p className="small muted" style={{ marginBottom: 0 }}>{nextSet.notes}</p>}
        </div>
      )}

      {takesPart && att.length > 0 && (
        <div className="card pad0">
          <div className="card-h" style={{ padding: '14px 16px 0' }}><h3>My recent attendance</h3></div>
          <table className="tbl">
            <thead><tr><th>Date</th><th>Session</th><th>Me</th></tr></thead>
            <tbody>{att.slice(0, 8).map((x) => <tr key={x.date}><td>{fmtDate(x.date)}</td><td>{x.title}</td><td><span className="chip sm" style={{ color: STATUS[x.st]?.[1] }}>{STATUS[x.st]?.[0] || x.st}</span></td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
