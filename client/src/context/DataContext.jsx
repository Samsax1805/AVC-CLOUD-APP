import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import api from '../services/api';
import { uid, TODAY } from '../utils/helpers';
import { rolesOf, ROLES } from '../hooks/usePermissions';

const DataContext = createContext(null);

const withCurrentUser = (list, u) => {
  if (!u || !u.email) return list;
  const ex = list.find((x) => x.email === u.email);
  if (ex) {
    return list.map((x) => (x.email === u.email ? {
      ...x, name: u.name || x.name, avatar: u.avatar !== undefined ? u.avatar : x.avatar,
      roles: u.roles && u.roles.length ? u.roles : x.roles, voice: u.voice || u.section || x.voice,
      dob: u.dob || x.dob, country: u.country || x.country, phone: u.phone || x.phone, provider: u.provider || x.provider,
    } : x));
  }
  return [...list, {
    id: u.id || uid('u'), name: u.name || u.email.split('@')[0], email: u.email, pass: '—',
    roles: u.roles && u.roles.length ? u.roles : ['member'], voice: u.voice || u.section || null,
    avatar: u.avatar || null, dob: u.dob || '', country: u.country || '', phone: u.phone || '',
    provider: u.provider || 'local', joined: u.joined || TODAY, color: '#1a2c60', status: 'active',
  }];
};

export const DataProvider = ({ children }) => {
  const auth = useAuth() || {};
  const toastCtx = useToast() || { toast: () => {} };
  const user = auth.user;
  const toast = toastCtx.toast;

  // [FIX] REAL-DATA MODE: everything starts EMPTY. Zeros until real records exist.
  const [users, setUsers] = useState([]);
  const [songs, setSongs] = useState([]);
  const [minutes, setMinutes] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [voiceNotes, setVoiceNotes] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [debts, setDebts] = useState([]);
  const [dues, setDues] = useState([]);
  const [elections, setElections] = useState([]);
  const [nominations, setNominations] = useState({});
  const [audit, setAudit] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [roleHistory, setRoleHistory] = useState([]);
  const [duesSettings, setDuesSettings] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [probations, setProbations] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [pendingNoms, setPendingNoms] = useState([]);
  const [playId, setPlayId] = useState(null);
  const [playProg, setPlayProg] = useState(0);
  const [loadingData, setLoadingData] = useState(true);
  const loaded = useRef(false);

  useEffect(() => { setUsers((prev) => withCurrentUser(prev, user)); }, [user]);

  /* Hydrate once from the real MongoDB collections */
  useEffect(() => {
    if (!user || loaded.current) return;
    loaded.current = true;
    api.get('/data')
      .then(({ data }) => {
        setUsers(withCurrentUser(data.users || [], user));
        setSongs(data.songs || []); setMinutes(data.minutes || []); setReceipts(data.receipts || []);
        setVoiceNotes(data.voiceNotes || []); setSessions(data.sessions || []); setDebts(data.debts || []);
        setDues(data.dues || []); setElections(data.elections || []); setNominations(data.nominations || {});
        setAudit(data.audit || []); setPendingUsers(data.pendingUsers || []); setRoleHistory(data.roleHistory || []);
        setDuesSettings(data.duesSettings || []); setAnnouncements(data.announcements || []); setDocuments(data.documents || []);
        setProbations(data.probations || []); setNotifs(data.notifs || []); setPendingNoms(data.pendingNoms || []);
      })
      .catch((err) => { if (err.response?.status !== 401) console.warn('Data load failed — starting empty.'); })
      .finally(() => setLoadingData(false));
  }, [user]);

  /* Debounced persist into the real collections */
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!user || loadingData) return;
    const t = setTimeout(() => {
      api.put('/data', {
        users, songs, minutes, receipts, voiceNotes, sessions, debts, dues, elections,
        nominations, audit, pendingUsers, roleHistory, duesSettings, announcements,
        documents, probations, notifs, pendingNoms,
      }).catch((err) => { if (err.response?.status !== 401) console.warn('Data save failed.'); });
    }, 900);
    return () => clearTimeout(t);
  }, [users, songs, minutes, receipts, voiceNotes, sessions, debts, dues, elections, nominations, audit, pendingUsers, roleHistory, duesSettings, announcements, documents, probations, notifs, pendingNoms, user, loadingData]);

  useEffect(() => { if (!playId) return; const t = setInterval(() => setPlayProg((p) => Math.min(100, p + 1.4)), 100); return () => clearInterval(t); }, [playId]);
  useEffect(() => { if (playProg >= 100) { setPlayId(null); setPlayProg(0); } }, [playProg]);

  const me = users.find((u) => u.email === user?.email) || null;

  const log = (action, detail) => setAudit((p) => [{ id: uid('a'), userId: me?.id || 'system', role: me ? rolesOf(me).map((r) => ROLES[r].label).join(' + ') : 'System', action, detail, time: new Date().toISOString().slice(0, 16).replace('T', ' ') }, ...(p || [])]);
  const notify = (text) => setNotifs((p) => [{ id: uid('n'), text, date: TODAY, readBy: [] }, ...(p || [])]);
  const togglePlay = (id) => { if (playId === id) { setPlayId(null); setPlayProg(0); } else { setPlayId(id); setPlayProg(0); } };

  const value = { me, loadingData, users, setUsers, songs, setSongs, minutes, setMinutes, receipts, setReceipts, voiceNotes, setVoiceNotes, sessions, setSessions, debts, setDebts, dues, setDues, elections, setElections, nominations, setNominations, audit, log, toast, playId, playProg, togglePlay, pendingUsers, setPendingUsers, roleHistory, setRoleHistory, duesSettings, setDuesSettings, announcements, setAnnouncements, documents, setDocuments, probations, setProbations, notifs, setNotifs, pendingNoms, setPendingNoms, notify };
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};
export const useDataContext = () => useContext(DataContext);