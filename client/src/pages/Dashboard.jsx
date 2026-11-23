import React, { Suspense, lazy, useEffect, useState } from 'react';
// The charts library is large: it loads just after the page appears
const AttChart = lazy(() => import('../components/DashCharts').then((m) => ({ default: m.AttChart })));
const VoiceChart = lazy(() => import('../components/DashCharts').then((m) => ({ default: m.VoiceChart })));
const DuesChart = lazy(() => import('../components/DashCharts').then((m) => ({ default: m.DuesChart })));
import { motion } from 'framer-motion';
import { TODAY, lira, fmtDate, shortDate, PIE_COLORS, duesNow } from '../utils/helpers';
import { PERMS, rolesOf, ACT_META, participates } from '../hooks/usePermissions';
import { fetchAudit } from '../services/audit';
import Icon from '../components/ui/Icon';
import Avatar from '../components/ui/Avatar';
import RoleChip from '../components/ui/RoleChip';
import StatCard from '../components/ui/StatCard';
import BirthdayBanner from '../components/BirthdayBanner';
import PushBanner from '../components/PushBanner';

const EmptyChart = ({ text }) => <div className="empty-chart">{text}</div>;

// Phones and small tablets get shorter charts (matches the 920px layout breakpoint)
const NARROW = '(max-width: 920px)';
const useNarrow = () => {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const m = window.matchMedia(NARROW);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
};

export default function Dashboard({ ctx }) {
  const {
    me, users = [], activeUsers = [], songs = [], sessions = [], debts = [], dues = [], auditCount = 0, electionStatus = null,
    minutes = [], probations = [], duesSettings = [], pendingUsers = [], announcements = [], setPage,
  } = ctx || {};

  const narrow = useNarrow();
  const chartH = narrow ? 170 : 220;
  const es = electionStatus;
  const outstanding = debts.reduce((a, d) => a + (d.amount - d.paid), 0);
  const myOut = debts.filter((d) => d.memberId === me.id).reduce((a, d) => a + (d.amount - d.paid), 0);

  // Attendance trend — built from REAL session records, newest last 5
  const attStats = sessions
    .map((s) => { const vals = Object.values(s.records || {}); const p = vals.filter((v) => v === 'present').length; return { ...s, rate: vals.length ? Math.round((p / vals.length) * 100) : 0 }; })
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const attData = attStats.slice(-5).map((s) => ({ d: shortDate(s.date), rate: s.rate }));

  // Voice parts pie — from REAL member sections
  const voiceCount = {};
  users.forEach((u) => { if (u.voice) voiceCount[u.voice] = (voiceCount[u.voice] || 0) + 1; });
  const voiceData = Object.entries(voiceCount).map(([name, value]) => ({ name, value }));

  // Weekly dues bars — from REAL due records
  const weekTotals = {};
  dues.filter((d) => d.type === 'weekly').forEach((d) => { weekTotals[d.period] = (weekTotals[d.period] || 0) + d.amount; });
  const duesData = Object.entries(weekTotals).map(([week, amount]) => ({ week, amount })).sort((a, b) => (a.week > b.week ? 1 : -1)).slice(-6);

  const canSeeActivity = PERMS.viewAudit(me); // [FIX] officers only
  // The six newest Audit Log entries, fetched on their own (the full log is no longer part of sign-in);
  // fetched again whenever this browser adds an entry
  const [audit, setAudit] = useState([]);
  useEffect(() => {
    if (!canSeeActivity) return undefined;
    const ctl = new AbortController();
    fetchAudit({ limit: 6 }, ctl.signal).then((d) => setAudit(d.entries || [])).catch(() => {});
    return () => ctl.abort();
  }, [canSeeActivity, auditCount]);

  const cards = [];
  if (PERMS.approveMembers(me)) cards.push({ icon: 'users', label: 'Total members', value: activeUsers.filter((u) => !u.system).length, sub: pendingUsers.length ? `${pendingUsers.length} pending approval` : 'All approved', tone: '#1a2c60' });
  if (PERMS.manageDebts(me)) cards.push({ icon: 'coins', label: 'Outstanding debts', value: lira(outstanding), tone: '#e11d48' });
  if (PERMS.manageDuesSettings(me)) cards.push({ icon: 'dollar', label: 'Current weekly dues', value: lira(duesNow(duesSettings)), sub: duesSettings.length ? `since ${fmtDate(duesNow.date || duesSettings[duesSettings.length - 1]?.effectiveFrom)}` : 'not set yet', tone: '#0f766e' });
  if (PERMS.markAttendance(me)) cards.push({ icon: 'check', label: 'Last attendance', value: (attStats[attStats.length - 1]?.rate || 0) + '%', sub: attStats.length ? shortDate(attStats[attStats.length - 1].date) : 'no sessions yet', tone: '#059669' });
  if (PERMS.manageProbation(me)) cards.push({ icon: 'clock', label: 'On probation', value: probations.filter((p) => p.status === 'active').length, tone: '#b45309' });
  if (PERMS.manageSongs(me)) cards.push({ icon: 'music', label: 'Songs in library', value: songs.length, tone: '#7c3aed' });
  if (PERMS.manageMinutes(me)) cards.push({ icon: 'file', label: 'Minutes published', value: minutes.length, tone: '#0284c7' });
  if (PERMS.manageElections(me)) cards.push({ icon: 'vote', label: 'Election', value: es ? es.label : 'None', sub: es?.title, tone: '#4f46e5' });
  if (!cards.length) {
    const mine = sessions.map((s) => (s.records || {})[me.id]).filter(Boolean);
    cards.push({ icon: 'check', label: 'My attendance rate', value: (mine.length ? Math.round((mine.filter((v) => v === 'present').length / mine.length) * 100) : 0) + '%', sub: mine.length ? `${mine.length} sessions` : 'no sessions yet', tone: '#059669' });
    cards.push({ icon: 'coins', label: 'My outstanding debt', value: lira(myOut), tone: '#e11d48' });
    cards.push({ icon: 'music', label: 'Songs available', value: songs.length, tone: '#7c3aed' });
    cards.push({ icon: 'vote', label: 'Election', value: es ? es.label : 'None', sub: es?.title, tone: '#4f46e5' });
  }

  return (
    <div className="stack dash">
      <BirthdayBanner users={users} me={me} />
      <PushBanner me={me} toast={ctx.toast} />

      {es && participates(me) && ['live', 'nominations', 'published'].includes(es.stage) && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="banner">
          {es.mock && <b>Practice · </b>}
          {es.stage === 'live' ? <><span className="live-dot" /> Voting is <b>live</b> — {es.title}. Your voice counts!</>
            : es.stage === 'nominations' ? <>🗳️ Nominations are open — {es.title}.</> : <>🏆 The results of {es.title} are published.</>}
          <button className="btn btn-sm btn-white" onClick={() => setPage('elections')}>{es.stage === 'live' ? 'Vote now →' : es.stage === 'nominations' ? 'Nominate →' : 'See results →'}</button>
        </motion.div>
      )}

      <div className="card hero">
        <div>
          <h2 className="hero-title">Welcome, {me.name.split(' ')[0]} 👋</h2>
          {/* [FIX] Date is computed live from the system clock — updates every day automatically */}
          <p className="muted hero-sub">{fmtDate(TODAY)} · Here's your ministry overview for today.</p>
          <div className="chip-row">{rolesOf(me).map((r) => <RoleChip key={r} r={r} />)}</div>
        </div>
      </div>

      <div className="grid g4 stat-grid dash-stats">{cards.slice(0, 4).map((c) => <StatCard key={c.label} {...c} />)}</div>

      <div className="grid g3 dash-row">
        <div className="card span2 dash-att">
          <div className="card-h"><h3>Attendance trend</h3><span className="chip sm">Last 5 services</span></div>
          {attData.length ? (
            <Suspense fallback={<div style={{ height: chartH }} />}><AttChart data={attData} height={chartH} /></Suspense>
          ) : <EmptyChart text="No attendance recorded yet. Once the Provost marks a service, the trend appears here." />}
        </div>

        <div className="card dash-voice">
          <div className="card-h"><h3>Voice parts</h3></div>
          {voiceData.length ? (
            <Suspense fallback={<div style={{ height: chartH }} />}><VoiceChart data={voiceData} height={chartH} narrow={narrow} /></Suspense>
          ) : <EmptyChart text="No voice parts assigned yet." />}
        </div>
      </div>

      <div className="grid g3 dash-row">
        <div className="card dash-dues">
          <div className="card-h"><h3>Weekly dues collected</h3></div>
          {duesData.length ? (
            <Suspense fallback={<div style={{ height: narrow ? 170 : 210 }} />}><DuesChart data={duesData} height={narrow ? 170 : 210} /></Suspense>
          ) : <EmptyChart text="No dues recorded yet." />}
        </div>

        {/* [FIX] Recent activity = officers only. Members see announcements instead. */}
        {canSeeActivity ? (
          <div className="card span2 dash-feed">
            <div className="card-h"><h3>Recent activity</h3><button className="chip link" onClick={() => setPage('audit')}>View all →</button></div>
            <div className="feed">
              {audit.slice(0, 6).map((a) => {
                const u = users.find((x) => x.id === a.userId);
                const meta = ACT_META[a.action] || { l: a.action, c: '#64748b' };
                return (
                  <div className="feed-row" key={a.id}>
                    <Avatar user={u} size={30} />
                    <div className="feed-txt"><b>{u?.name || 'System'}</b> · <span className="act-tag" style={{ background: meta.c + '1a', color: meta.c }}>{meta.l}</span> <span className="act-tag" style={{ background: '#1a2c601a', color: '#1a2c60' }}>{a.role}</span><div className="muted small">{a.detail}</div></div>
                    <span className="muted tiny">{(a.time || '').slice(5)}</span>
                  </div>
                );
              })}
              {!audit.length && <p className="muted small" style={{ padding: 12 }}>No activity recorded yet.</p>}
            </div>
          </div>
        ) : (
          <div className="card span2 dash-feed">
            <div className="card-h"><h3>Choir announcements</h3><button className="chip link" onClick={() => setPage('announcements')}>View all →</button></div>
            <div className="feed">
              {announcements.slice(0, 4).map((an) => (
                <div className="feed-row" key={an.id}>
                  <span className="notif-ic" style={{ background: '#e9a63a1a', color: '#d18f26' }}><Icon name="bell" size={14} /></span>
                  <div className="feed-txt"><b>{an.title}</b><div className="muted small">{an.body}</div></div>
                  <span className="muted tiny">{(an.date || '').slice(5)}</span>
                </div>
              ))}
              {!announcements.length && <p className="muted small" style={{ padding: 12 }}>No announcements yet — check back soon.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}