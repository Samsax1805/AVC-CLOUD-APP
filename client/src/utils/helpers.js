// ===== Shared helper utilities (all exports must stay at top level, no indentation) =====

export const TODAY = new Date().toISOString().slice(0, 10);

export const uid = (p = 'id') => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const naira = (n) => '₦' + Number(n || 0).toLocaleString();

export const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(String(d).length === 10 ? d + 'T00:00:00' : d);
  return dt.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const shortDate = (d) => {
  if (!d) return '—';
  const dt = new Date(String(d).length === 10 ? d + 'T00:00:00' : d);
  return dt.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
};

export const fmtDur = (secs) => {
  const m = Math.floor((secs || 0) / 60);
  const s = (secs || 0) % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const duesNow = (settings = []) => {
  if (!settings || !settings.length) return 0; // [FIX] new database = zero dues
  const sorted = [...settings].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  const active = sorted.find((s) => s.effectiveFrom <= TODAY);
  return active ? active.amount : sorted[sorted.length - 1].amount;
};

export const PIE_COLORS = ['#7c3aed', '#0284c7', '#e9a63a', '#059669', '#e11d48', '#4f46e5'];

export const VOICE_PARTS = ['Soprano', 'Alto', 'Tenor', 'Bass'];

export const POSTS = [
  'President',
  'Vice President',
  'Secretary General',
  'Assistant Secretary',
  'Financial Secretary',
  'Treasurer',
  'Provost',
  'Welfare Officer 1',
  'Welfare Officer 2',
  'Librarian',
  'Song Leader',
  'Publicity Secretary',
];

// [NEW] Used by App.jsx to force Google first-timers through profile setup
export const isProfileComplete = (u) =>
  !!(u && u.name && u.dob && u.country && u.phone && (u.voice || u.section));