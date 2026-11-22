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

// A song can be for all parts or any mix of them; stored as "All parts" or e.g. "Soprano, Alto".
// Older songs saved as "SATB Full" (or with no part) count as all parts.
export const ALL_PARTS = 'All parts';
export const songParts = (s) => {
  const p = String(s?.part || '');
  const list = VOICE_PARTS.filter((x) => p.includes(x));
  return !p || /^(all parts|satb)/i.test(p) || !list.length ? [...VOICE_PARTS] : list;
};
export const partsLabel = (parts) => (parts.length === VOICE_PARTS.length ? ALL_PARTS : VOICE_PARTS.filter((x) => parts.includes(x)).join(', '));

// Song categories (a song can have several): parts of the Mass and seasons, then themes
export const SONG_CATEGORIES = [
  { group: 'Mass, seasons & occasions', items: [
    'Opening / Entrance', 'Praise', 'Thanksgiving', 'Penitential', 'Kyrie', 'Gloria', 'Psalm / Responsorial',
    'Alleluia / Gospel Acclamation', 'Offertory', 'Communion', 'Adoration', 'Benediction', 'Closing / Recessional',
    'Advent', 'Christmas', 'Lent', 'Easter', 'Marian', 'Holy Spirit', 'Sacred Heart',
    'Missionary / Evangelical', 'Vocational', 'Wedding', 'Funeral / Requiem', 'Youth',
  ] },
  { group: 'Themes', items: [
    'Faith and Trust', 'Hope and Encouragement', 'Love and Charity', 'Salvation and Redemption', 'Forgiveness and Mercy',
    'Discipleship', 'Christian Unity', 'Spiritual Warfare', 'Prayer and Consecration', 'Heaven and Eternal Life',
    "God's Guidance and Protection",
  ] },
];

// Songs uploaded before categories existed have a single free-text tag instead
export const songCategories = (s) => (s.categories?.length ? s.categories : s.tag ? [s.tag] : []);

// Accounts that look like the same person (same name, any order or spacing): usually someone who signed up twice
const nameKey = (n) => String(n || '').toLowerCase().split(/[^a-z]+/).filter(Boolean).sort().join(' ');
// A system account (admin@avcsb.com) is meant to share its holder's name, so it never counts as a duplicate
export const lookalikes = (users, u) => (u.system ? [] : users.filter((x) => x.id !== u.id && !x.system && (x.status || 'active') === 'active' && nameKey(x.name) && nameKey(x.name) === nameKey(u.name)));
// "today", "3 days ago", "never" — only when the server shared it (officers who manage members)
// Uses the later of the last sign-in and the last time the account was used while staying signed in
export const lastUsed = (u) => [u?.lastLoginAt, u?.lastSeenAt].filter(Boolean).sort().pop() || null;
export const lastSignIn = (u) => {
  if (!('lastLoginAt' in (u || {}))) return null;
  const at = lastUsed(u);
  if (!at) return 'never';
  const days = Math.floor((Date.now() - new Date(at)) / 864e5);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};

// The choir's offices up for election; the Electoral Committee can add a new office by name
export const POSTS = [
  'President',
  'Secretary',
  'Finance Secretary',
  'Provost',
  'Custodian 1',
  'Custodian 2',
  'P.R.O. (Public Relations Officer)',
  'Choir Master',
  'Assistant Choir Master',
];

// [NEW] Used by App.jsx to force Google first-timers through profile setup
export const isProfileComplete = (u) =>
  !!(u && u.name && u.dob && u.country && u.phone && (u.voice || u.section));