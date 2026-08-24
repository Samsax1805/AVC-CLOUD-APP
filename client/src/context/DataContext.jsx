import React, { createContext, useContext, useState } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { uid, TODAY } from '../utils/helpers';
import { rolesOf, ROLES } from '../hooks/usePermissions';
import * as seed from '../data/seed';

const DataContext = createContext(null);

export const DataProvider = ({ children }) => {
  const auth = useAuth() || {};
  const toastCtx = useToast() || { toast: () => {} };
  const user = auth.user;
  const toast = toastCtx.toast;

  const [users, setUsers] = useState(seed.seedUsers || []);
  const [songs, setSongs] = useState(seed.seedSongs || []);
  const [minutes, setMinutes] = useState(seed.seedMinutes || []);
  const [receipts, setReceipts] = useState(seed.seedReceipts || []);
  const [voiceNotes, setVoiceNotes] = useState(seed.seedVoice || []);
  const [sessions, setSessions] = useState(typeof seed.genSessions === 'function' ? seed.genSessions() : (seed.seedSessions || []));
  const [debts, setDebts] = useState(seed.seedDebts || []);
  const [dues, setDues] = useState(seed.seedDues || []);
  const [elections, setElections] = useState(seed.seedElections || []);
  const [nominations, setNominations] = useState(seed.seedNominations || {});
  const [audit, setAudit] = useState(seed.seedAudit || []);
  const [pendingUsers, setPendingUsers] = useState(seed.seedPendingUsers || []);
  const [roleHistory, setRoleHistory] = useState(seed.seedRoleHistory || []);
  const [duesSettings, setDuesSettings] = useState(seed.seedDuesSettings || []);
  const [announcements, setAnnouncements] = useState(seed.seedAnnouncements || []);
  const [documents, setDocuments] = useState(seed.seedDocuments || []);
  const [probations, setProbations] = useState(seed.seedProbations || []);
  const [notifs, setNotifs] = useState(seed.seedNotifs || []);
  const [pendingNoms, setPendingNoms] = useState(seed.seedPendingNoms || []);
  const [playId, setPlayId] = useState(null);
  const [playProg, setPlayProg] = useState(0);

  const me = users.find((u) => u.email === user?.email) || users[0] || null;

  const log = (action, detail) => setAudit((p) => [{ id: uid('a'), userId: me?.id || 'u1', role: me ? rolesOf(me).map((r) => ROLES[r].label).join(' + ') : 'System', action, detail, time: new Date().toISOString().slice(0, 16).replace('T', ' ') }, ...(p || [])]);
  const notify = (text) => setNotifs((p) => [{ id: uid('n'), text, date: TODAY, readBy: [] }, ...(p || [])]);
  const togglePlay = (id) => { if (playId === id) { setPlayId(null); setPlayProg(0); } else { setPlayId(id); setPlayProg(0); } };

  const value = { me, users, setUsers, songs, setSongs, minutes, setMinutes, receipts, setReceipts, voiceNotes, setVoiceNotes, sessions, setSessions, debts, setDebts, dues, setDues, elections, setElections, nominations, setNominations, audit, log, toast, playId, playProg, togglePlay, pendingUsers, setPendingUsers, roleHistory, setRoleHistory, duesSettings, setDuesSettings, announcements, setAnnouncements, documents, setDocuments, probations, setProbations, notifs, setNotifs, pendingNoms, setPendingNoms, notify };
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};
export const useDataContext = () => useContext(DataContext);
