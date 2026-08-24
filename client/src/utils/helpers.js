export const TODAY = '2026-08-17';
export const uid = (p) => p + Math.random().toString(36).slice(2, 8);
export const naira = (n) => '₦' + Number(n || 0).toLocaleString();
export const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const shortDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const fmtDur = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export const PIE_COLORS = ['#7c3aed', '#0ea5e9', '#f59e0b', '#10b981'];
export const VOICE_PARTS = ['SATB Full', 'Soprano Part', 'Alto Part', 'Tenor Part', 'Bass Part', 'Instrumental'];
export const POSTS = ['President', 'Vice President', 'Secretary', 'Provost', 'Custodian', 'Financial Secretary'];
export const duesNow = (settings) => {
  const valid = settings.filter((s) => s.effectiveFrom <= TODAY).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return valid[0]?.amount || 0;
};