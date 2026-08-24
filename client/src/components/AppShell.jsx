import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDataContext } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { ROLES, rolesOf, PERMS, NAV_DEFS, visibleNav, ACT_META } from '../hooks/usePermissions';
import Icon from './ui/Icon';
import Avatar from './ui/Avatar';
import Dashboard from '../pages/Dashboard';
import MusicLibrary from '../pages/MusicLibrary';
import MinutesPage from '../pages/Minutes';
import VoicePage from '../pages/VoiceNotes';
import ReceiptsPage from '../pages/Receipts';
import AttendancePage from '../pages/Attendance';
import DebtsPage from '../pages/Debts';
import DuesPage from '../pages/Dues';
import ElectionsPage from '../pages/Elections';
import AuditPage from '../pages/AuditLog';
import MembersPage from '../pages/MembersRoles';
import ProfilePage from '../pages/Profile';
import AnnouncementsPage from '../pages/Announcements';
import DocumentsPage from '../pages/Documents';
import ProbationPage from '../pages/Probation';

export default function AppShell() {
  const data = useDataContext();
  const { user, logout } = useAuth();
  const [page, setPage] = useState('dashboard');
  const [sideOpen, setSideOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const { me, notifs, setNotifs, elections } = data;

  useEffect(() => { if (me && !visibleNav(me).some((n) => n.id === page)) setPage('dashboard'); }, [me, page]);
  if (!me) return null;

  const ctx = { ...data, setPage };
  const nav = visibleNav(me);
  const liveElections = elections.filter((e) => e.status === 'live');
  const unread = notifs.filter((n) => !n.readBy.includes(me.id)).length;
  const openNotifs = () => { setNotifOpen((o) => !o); if (!notifOpen) setNotifs((p) => p.map((n) => (n.readBy.includes(me.id) ? n : { ...n, readBy: [...n.readBy, me.id] }))); };
  const sections = [...new Set(nav.map((n) => n.sec))];

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard ctx={ctx} />;
      case 'music': return <MusicLibrary ctx={ctx} />;
      case 'minutes': return <MinutesPage ctx={ctx} />;
      case 'voice': return <VoicePage ctx={ctx} />;
      case 'receipts': return <ReceiptsPage ctx={ctx} />;
      case 'attendance': return <AttendancePage ctx={ctx} />;
      case 'debts': return <DebtsPage ctx={ctx} />;
      case 'dues': return <DuesPage ctx={ctx} />;
      case 'elections': return <ElectionsPage ctx={ctx} />;
      case 'audit': return <AuditPage ctx={ctx} />;
      case 'members': return <MembersPage ctx={ctx} />;
      case 'profile': return <ProfilePage ctx={ctx} />;
      case 'announcements': return <AnnouncementsPage ctx={ctx} />;
      case 'documents': return <DocumentsPage ctx={ctx} />;
      case 'probation': return <ProbationPage ctx={ctx} />;
      default: return <Dashboard ctx={ctx} />;
    }
  };

  return (
    <div className={`shell ${dark ? 'dark' : ''}`}>
      {sideOpen && <div className="scrim" onClick={() => setSideOpen(false)} />}
      <aside className={`sidebar ${sideOpen ? 'open' : ''}`}>
        <div className="side-brand">
          <img src="/choir_logo.jpeg" alt="logo" className="logo-img sm" />
          <div className="brand-sc">Choir Cloud</div>
        </div>
        <nav className="side-nav">
          {sections.map((sec) => (
            <div key={sec}>
              <div className="nav-sec">{sec}</div>
              {nav.filter((n) => n.sec === sec).map((n) => (
                <button key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => { setPage(n.id); setSideOpen(false); }}>
                  <Icon name={n.icon} size={16} />
                  <span>{n.id === 'debts' ? (PERMS.manageDebts(me) ? 'Debt Tracker' : 'My Debts') : n.label}</span>
                  {n.id === 'elections' && liveElections.length > 0 && <span className="nav-live">{liveElections.length}</span>}
                </button>
              ))}
            </div>
          ))}
          <div className="side-div" />
          <button className="nav-item"><Icon name="lock" size={16} /><span>Security</span></button>
          <button className="nav-item"><Icon name="bell" size={16} /><span>Help Centre</span></button>
          <div className="dm-row">
            <span className="dm-l"><Icon name="moon" size={15} /> Dark Mode</span>
            <button className={`toggle ${dark ? 'on' : ''}`} onClick={() => setDark((d) => !d)}><span /></button>
          </div>
          <div className="nav-sec">Admin Portal</div>
          <button className="btn btn-pri full-sm" onClick={() => { setPage('music'); setSideOpen(false); }}><Icon name="plus" size={14} /> New Upload</button>
        </nav>
        <div className="side-user">
          <Avatar user={me} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}><div className="su-name">{me.name}</div><div className="su-role">{rolesOf(me).map((r) => ROLES[r].label).join(' · ')}</div></div>
          <button className="icon-btn light" title="Sign out" onClick={logout}><Icon name="logout" size={16} /></button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn burger" onClick={() => setSideOpen(true)}><Icon name="menu" size={18} /></button>
          <div className="search-box navy"><Icon name="search" size={15} /><input id="global-search" name="q" aria-label="Search anything" placeholder="Search anything…" /></div>
          <div style={{ flex: 1 }} />
          <div style={{ position: 'relative' }}>
            <button className="icon-btn ring" onClick={openNotifs}><Icon name="bell" size={16} />{unread > 0 && <span className="bell-dot" />}</button>
            <AnimatePresence>
              {notifOpen && (
                <motion.div className="notif-pop" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
                  <div className="notif-h">Notifications</div>
                  {notifs.slice(0, 8).map((n) => (
                    <div className={`notif-row ${n.readBy.includes(me.id) ? '' : 'unread'}`} key={n.id}>
                      <span className="notif-ic" style={{ background: '#e9a63a1a', color: '#d18f26' }}><Icon name="bell" size={14} /></span>
                      <div><div className="notif-t">{n.text}</div><div className="notif-s">{n.date}</div></div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <span className="top-name">{me.name}</span>
          <button className="avatar-btn" onClick={() => setPage('profile')}><Avatar user={me} size={34} /></button>
        </header>
        <main className="content" onClick={() => notifOpen && setNotifOpen(false)}>
          <AnimatePresence mode="wait">
            <motion.div key={page} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
              {renderPage()}
            </motion.div>
          </AnimatePresence>
        </main>
        <footer className="foot-bar">© 2026 St. Barnabas Amazing Voices Choir. All rights Reserved</footer>
      </div>
    </div>
  );
}