export const ROLES = {
  admin: { label: 'Admin', color: '#b45309', bg: '#fef3c7', desc: 'Full system control. Grants & revokes every privilege.' },
  president: { label: 'President', color: '#6d28d9', bg: '#ede9fe', desc: 'Second-in-command. Approvals, roles, dues, audit.' },
  secretary: { label: 'Secretary', color: '#0369a1', bg: '#e0f2fe', desc: 'Minutes, receipts, documents & announcements.' },
  provost: { label: 'Provost', color: '#047857', bg: '#d1fae5', desc: 'Attendance, absence/lateness debts, probation.' },
  custodian: { label: 'Custodian', color: '#be123c', bg: '#ffe4e6', desc: 'Songs, audio & music files.' },
  electoral: { label: 'Electoral Committee', color: '#4338ca', bg: '#e0e7ff', desc: 'Nominations, polls and live election results.' },
  member: { label: 'Member', color: '#475569', bg: '#f1f5f9', desc: 'Chorister. Votes when elections are live.' },
};
export const GRANTABLE = ['president', 'secretary', 'provost', 'custodian', 'electoral'];
export const rolesOf = (u) => (u.roles.length ? u.roles : ['member']);
export const hasAny = (u, list) => list.some((r) => u.roles.includes(r));
export const PERMS = {
  manageSongs: (u) => hasAny(u, ['admin', 'president', 'custodian']),
  manageMinutes: (u) => hasAny(u, ['admin', 'president', 'secretary']),
  manageReceipts: (u) => hasAny(u, ['admin', 'president', 'secretary']),
  manageDebts: (u) => hasAny(u, ['admin', 'president']),
  markAttendance: (u) => hasAny(u, ['admin', 'president', 'provost']),
  manageDues: (u) => hasAny(u, ['admin', 'provost']),
  recordVoice: (u) => hasAny(u, ['admin', 'president', 'custodian']),
  manageElections: (u) => hasAny(u, ['admin', 'electoral']),
  viewAudit: (u) => hasAny(u, ['admin', 'president']),
  manageMembers: (u) => hasAny(u, ['admin', 'president']),
  approveMembers: (u) => hasAny(u, ['admin', 'president']),
  manageAnnouncements: (u) => hasAny(u, ['admin', 'president', 'secretary']),
  manageDocuments: (u) => hasAny(u, ['admin', 'president', 'secretary']),
  manageProbation: (u) => hasAny(u, ['admin', 'president', 'provost']),
  manageDuesSettings: (u) => hasAny(u, ['admin', 'president']),
};
export const ACT_META = {
  AUTH: { l: 'Sign-in', c: '#64748b' }, ROLE_GRANTED: { l: 'Role granted', c: '#f59e0b' }, ROLE_REVOKED: { l: 'Role revoked', c: '#ef4444' },
  SONG_UPLOAD: { l: 'Song upload', c: '#7c3aed' }, SONG_EDIT: { l: 'Song edit', c: '#8b5cf6' }, SONG_DELETE: { l: 'Song delete', c: '#ef4444' },
  MINUTES: { l: 'Minutes', c: '#0284c7' }, RECEIPT: { l: 'Receipt', c: '#0ea5e9' }, VOICE: { l: 'Voice note', c: '#e11d48' },
  ATTENDANCE: { l: 'Attendance', c: '#059669' }, DEBT_UPDATE: { l: 'Debt update', c: '#f43f5e' },
  DUES: { l: 'Dues', c: '#10b981' }, ELECTION: { l: 'Election', c: '#6366f1' }, VOTE: { l: 'Vote cast', c: '#4f46e5' },
  ANNOUNCE: { l: 'Announcement', c: '#d97706' }, DOC: { l: 'Document', c: '#0d9488' }, PROBATION: { l: 'Probation', c: '#b45309' },
  DUES_SET: { l: 'Dues setting', c: '#0f766e' }, MEMBER_APPROVED: { l: 'Member approved', c: '#059669' }, MEMBER_REJECTED: { l: 'Member rejected', c: '#dc2626' },
  NOM_SUGGEST: { l: 'Nomination suggested', c: '#6366f1' },
};
export const POSTS = ['President', 'Vice President', 'Secretary', 'Assistant Secretary', 'Provost', 'Assistant Provost', 'Custodian', 'Assistant Custodian', 'Financial Secretary', 'Treasurer', 'Welfare Officer', 'Public Relations Officer'];
export const NAV_DEFS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', sec: 'Main' },
  { id: 'music', label: 'Music & Files', icon: 'music', sec: 'Main' },
  { id: 'voice', label: 'Voice Notes', icon: 'mic', sec: 'Main' },
  { id: 'announcements', label: 'Announcements', icon: 'bell', sec: 'Library' },
  { id: 'documents', label: 'Documents', icon: 'file', sec: 'Library' },
  { id: 'minutes', label: 'Minutes', icon: 'file', sec: 'Records' },
  { id: 'receipts', label: 'Receipts', icon: 'receipt', sec: 'Records' },
  { id: 'attendance', label: 'Attendance', icon: 'check', sec: 'Records' },
  { id: 'debts', label: 'Debts & Accounts', icon: 'coins', sec: 'Records' },
  { id: 'dues', label: 'Dues Records', icon: 'dollar', sec: 'Records' },
  { id: 'probation', label: 'Probation', icon: 'clock', sec: 'Operations' },
  { id: 'elections', label: 'Elections', icon: 'vote', sec: 'Governance' },
  { id: 'audit', label: 'Audit Log', icon: 'shield', sec: 'Governance' },
  { id: 'members', label: 'Members & Roles', icon: 'users', sec: 'Governance' },
  { id: 'profile', label: 'Settings', icon: 'user', sec: 'Account' },
];
export const visibleNav = (me) => NAV_DEFS.filter((n) => {
  if (n.id === 'receipts') return PERMS.manageReceipts(me);
  if (n.id === 'dues') return PERMS.manageDues(me);
  if (n.id === 'audit') return PERMS.viewAudit(me);
  if (n.id === 'members') return PERMS.manageMembers(me);
  if (n.id === 'probation') return PERMS.manageProbation(me);
  return true;
});