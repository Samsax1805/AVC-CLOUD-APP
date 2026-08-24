import React from 'react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend, BarChart, Bar } from 'recharts';
import { TODAY, naira, fmtDate, shortDate, PIE_COLORS, duesNow } from '../utils/helpers';
import { PERMS, rolesOf, ACT_META } from '../hooks/usePermissions';
import Icon from '../components/ui/Icon';
import Avatar from '../components/ui/Avatar';
import RoleChip from '../components/ui/RoleChip';
import StatCard from '../components/ui/StatCard';

export default function Dashboard({ ctx }) {
  const { me, users, songs, sessions, debts, dues, audit, elections, minutes, probations, duesSettings, pendingUsers, setPage } = ctx;
  const liveE = elections.find((e) => e.status === 'live');
  const manage = PERMS.manageDebts(me);
  const outstanding = debts.reduce((a, d) => a + (d.amount - d.paid), 0);
  const myOut = debts.filter((d) => d.memberId === me.id).reduce((a, d) => a + (d.amount - d.paid), 0);
  const attStats = sessions.map((s) => { const vals = Object.values(s.records); const p = vals.filter((v) => v === 'present').length; return { ...s, rate: vals.length ? Math.round((p / vals.length) * 100) : 0 }; });
  const attData = [...attStats].reverse().map((s) => ({ d: shortDate(s.date), rate: s.rate }));
  const voiceCount = {}; users.forEach((u) => { voiceCount[u.voice] = (voiceCount[u.voice] || 0) + 1; });
  const voiceData = Object.entries(voiceCount).map(([name, value]) => ({ name, value }));
  const weekTotals = {}; dues.filter((d) => d.type === 'weekly').forEach((d) => { weekTotals[d.period] = (weekTotals[d.period] || 0) + d.amount; });
  const duesData = Object.entries(weekTotals).map(([week, amount]) => ({ week, amount })).sort((a, b) => (a.week > b.week ? 1 : -1));

  const cards = [];
  if (PERMS.approveMembers(me)) cards.push({ icon: 'users', label: 'Total members', value: users.length, sub: `${pendingUsers.length} pending approval`, tone: '#1a2c60' });
  if (PERMS.manageDebts(me)) cards.push({ icon: 'coins', label: 'Outstanding debts', value: naira(outstanding), tone: '#e11d48' });
  if (PERMS.manageDuesSettings(me)) cards.push({ icon: 'dollar', label: 'Current weekly dues', value: naira(duesNow(duesSettings)), tone: '#0f766e' });
  if (PERMS.markAttendance(me)) cards.push({ icon: 'check', label: 'Last attendance', value: (attStats[0]?.rate || 0) + '%', sub: shortDate(attStats[0]?.date || TODAY), tone: '#059669' });
  if (PERMS.manageProbation(me)) cards.push({ icon: 'clock', label: 'On probation', value: probations.filter((p) => p.status === 'active').length, tone: '#b45309' });
  if (PERMS.manageSongs(me)) cards.push({ icon: 'music', label: 'Songs in library', value: songs.length, tone: '#7c3aed' });
  if (PERMS.manageMinutes(me)) cards.push({ icon: 'file', label: 'Minutes published', value: minutes.length, tone: '#0284c7' });
  if (PERMS.manageElections(me)) cards.push({ icon: 'vote', label: 'Live polls', value: elections.filter((e) => e.status === 'live').length, tone: '#4f46e5' });
  if (!cards.length) {
    const mine = sessions.map((s) => s.records[me.id]).filter(Boolean);
    cards.push({ icon: 'check', label: 'My attendance rate', value: (mine.length ? Math.round((mine.filter((v) => v === 'present').length / mine.length) * 100) : 0) + '%', tone: '#059669' });
    cards.push({ icon: 'coins', label: 'My outstanding debt', value: naira(myOut), tone: '#e11d48' });
    cards.push({ icon: 'music', label: 'Songs available', value: songs.length, tone: '#7c3aed' });
    cards.push({ icon: 'vote', label: 'Live elections', value: elections.filter((e) => e.status === 'live').length, tone: '#4f46e5' });
  }

  return (
    <div className="stack">
      {liveE && !liveE.choice?.[me.id] && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="banner">
          <span className="live-dot" /> Voting is <b>live</b> for the <b>{liveE.post}</b> post — your voice counts!
          <button className="btn btn-sm btn-white" onClick={() => setPage('elections')}>Vote now →</button>
        </motion.div>
      )}
      <div className="card hero">
        <div>
          <h2 style={{ fontSize: 24 }}>Welcome, {me.name.split(' ')[0]} 👋</h2>
          <p className="muted" style={{ margin: '6px 0 12px' }}>{fmtDate(TODAY)} · Here's your ministry overview for today.</p>
          <div className="chip-row">{rolesOf(me).map((r) => <RoleChip key={r} r={r} />)}</div>
        </div>
      </div>
      <div className="grid g4">{cards.slice(0, 4).map((c) => <StatCard key={c.label} {...c} />)}</div>
      <div className="grid g3">
        <div className="card span2">
          <div className="card-h"><h3>Attendance trend</h3><span className="chip sm">Last 5 services</span></div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={attData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs><linearGradient id="gAtt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e9a63a" stopOpacity={0.4} /><stop offset="100%" stopColor="#e9a63a" stopOpacity={0.02} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee5d2" vertical={false} />
              <XAxis dataKey="d" tick={{ fontSize: 11, fill: '#8b7f6a' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#8b7f6a' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e3d8c2', fontSize: 12 }} />
              <Area type="monotone" dataKey="rate" stroke="#d18f26" strokeWidth={2.5} fill="url(#gAtt)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div className="card-h"><h3>Voice parts</h3></div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={voiceData} dataKey="value" nameKey="name" innerRadius={46} outerRadius={72} paddingAngle={3}>
                {voiceData.map((v, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e3d8c2', fontSize: 12 }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid g3">
        <div className="card">
          <div className="card-h"><h3>Weekly dues collected</h3></div>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={duesData} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee5d2" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#8b7f6a' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#8b7f6a' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e3d8c2', fontSize: 12 }} formatter={(v) => naira(v)} />
              <Bar dataKey="amount" fill="#1a2c60" radius={[6, 6, 0, 0]} maxBarSize={38} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card span2">
          <div className="card-h"><h3>Recent activity</h3>{PERMS.viewAudit(me) && <button className="chip link" onClick={() => setPage('audit')}>View all →</button>}</div>
          <div className="feed">
            {audit.slice(0, 6).map((a) => {
              const u = users.find((x) => x.id === a.userId);
              const meta = ACT_META[a.action] || { l: a.action, c: '#64748b' };
              return (
                <div className="feed-row" key={a.id}>
                  <Avatar user={u} size={30} />
                  <div className="feed-txt"><b>{u?.name || 'System'}</b> · <span className="act-tag" style={{ background: meta.c + '1a', color: meta.c }}>{meta.l}</span> <span className="act-tag" style={{ background: '#1a2c601a', color: '#1a2c60' }}>{a.role}</span><div className="muted small">{a.detail}</div></div>
                  <span className="muted tiny">{a.time.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}