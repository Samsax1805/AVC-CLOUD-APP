export const seedUsers = [
  { id: 'u1', name: 'Adaeze Okafor', email: 'admin@choircloud.com', pass: 'demo123', roles: ['admin'], voice: 'Alto', joined: '2023-01-12', color: '#f59e0b' },
  { id: 'u2', name: 'Tunde Bakare', email: 'president@choircloud.com', pass: 'demo123', roles: ['president'], voice: 'Tenor', joined: '2023-03-04', color: '#7c3aed' },
  { id: 'u3', name: 'Grace Eze', email: 'secretary@choircloud.com', pass: 'demo123', roles: ['secretary'], voice: 'Soprano', joined: '2023-05-19', color: '#0284c7' },
  { id: 'u4', name: 'Samuel Adeyemi', email: 'provost@choircloud.com', pass: 'demo123', roles: ['provost'], voice: 'Bass', joined: '2023-07-02', color: '#059669' },
  { id: 'u5', name: 'Ruth Chukwu', email: 'custodian@choircloud.com', pass: 'demo123', roles: ['custodian'], voice: 'Alto', joined: '2023-09-14', color: '#e11d48' },
  { id: 'u6', name: 'David Olawale', email: 'electoral@choircloud.com', pass: 'demo123', roles: ['electoral'], voice: 'Tenor', joined: '2024-01-08', color: '#4f46e5' },
  { id: 'u7', name: 'Miriam Bello', email: 'miriam@choircloud.com', pass: 'demo123', roles: [], voice: 'Soprano', joined: '2024-04-22', color: '#0ea5e9' },
  { id: 'u8', name: 'Joshua Nnamdi', email: 'joshua@choircloud.com', pass: 'demo123', roles: [], voice: 'Bass', joined: '2024-06-30', color: '#8b5cf6' },
  { id: 'u9', name: 'Esther Adeola', email: 'esther@choircloud.com', pass: 'demo123', roles: [], voice: 'Alto', joined: '2025-02-11', color: '#ec4899' },
  { id: 'u10', name: 'Peter Femi', email: 'peter@choircloud.com', pass: 'demo123', roles: [], voice: 'Tenor', joined: '2025-05-27', color: '#14b8a6' },
];

export const seedSongs = [
  { id: 's1', title: 'Hallelujah Anthem', part: 'SATB Full', format: 'MP3', size: '8.4 MB', duration: '4:32', by: 'u5', date: '2026-07-02', tag: 'Sunday Service', cover: '#7c3aed' },
  { id: 's2', title: 'Imela (Thank You Lord)', part: 'Soprano Part', format: 'MP3', size: '5.1 MB', duration: '3:48', by: 'u5', date: '2026-07-10', tag: 'Ministration', cover: '#0284c7' },
  { id: 's3', title: 'You Are Worthy', part: 'Alto Part', format: 'MP3', size: '4.9 MB', duration: '4:05', by: 'u2', date: '2026-07-18', tag: 'Sunday Service', cover: '#e11d48' },
  { id: 's4', title: 'Great Is Thy Faithfulness', part: 'SATB Full', format: 'PDF + MP3', size: '12.3 MB', duration: '5:12', by: 'u5', date: '2026-07-25', tag: 'Hymn', cover: '#059669' },
  { id: 's5', title: 'Nara (Receive Praise)', part: 'Tenor Part', format: 'MP3', size: '6.2 MB', duration: '4:44', by: 'u2', date: '2026-08-03', tag: 'Praise', cover: '#f59e0b' },
  { id: 's6', title: 'Way Maker', part: 'Bass Part', format: 'MP3', size: '7.0 MB', duration: '5:30', by: 'u5', date: '2026-08-11', tag: 'Worship', cover: '#4f46e5' },
];

export const seedMinutes = [
  { id: 'm1', title: 'Monthly General Meeting — July 2026', date: '2026-07-05', by: 'u3', body: 'Meeting opened at 4:05 PM with an opening hymn. The President reviewed the June activity report. Treasurer confirmed ₦84,000 in dues collected. It was resolved that the choir retreat holds September 18–20. Welfare committee to visit two members. Adjourned at 6:20 PM.' },
  { id: 'm2', title: 'Executive Committee Meeting', date: '2026-07-20', by: 'u3', body: 'Excos reviewed robe procurement quotes and approved the lowest bidder. Custodian to inventory music folders before August ends. Provost to enforce punctuality fines from August. Electoral committee inaugurated for the October elections.' },
  { id: 'm3', title: 'Choir Retreat Planning Session', date: '2026-08-01', by: 'u3', body: 'Venue confirmed at Grace Gardens, Ibadan. Transport contribution set at ₦10,000 per member. Theme: "Deeper Worship". Song list for the retreat to be released by the custodian. Deadline for payment: August 30.' },
  { id: 'm4', title: 'Weekly Rehearsal Notes — Aug 9', date: '2026-08-09', by: 'u2', body: 'Focused on "Way Maker" transitions and "Nara" ending. Sopranos to watch the key change at bar 24. Next rehearsal Wednesday 6 PM. Attendance was 82%.' },
];

export const seedReceipts = [
  { id: 'r1', title: 'Robe cleaning service', amount: 25000, category: 'Maintenance', date: '2026-07-08', by: 'u2' },
  { id: 'r2', title: 'Keyboard repairs', amount: 45000, category: 'Equipment', date: '2026-07-15', by: 'u2' },
  { id: 'r3', title: 'Sheet music printing', amount: 12000, category: 'Materials', date: '2026-07-22', by: 'u2' },
  { id: 'r4', title: 'Retreat venue deposit', amount: 80000, category: 'Events', date: '2026-08-02', by: 'u2' },
  { id: 'r5', title: 'Microphones (x2)', amount: 60000, category: 'Equipment', date: '2026-08-10', by: 'u2' },
];

export const seedVoice = [
  { id: 'v1', title: 'Soprano run — "Imela" bridge', duration: '0:42', by: 'u5', date: '2026-08-12', seed: 3 },
  { id: 'v2', title: 'Rehearsal correction — ending of "Nara"', duration: '1:15', by: 'u2', date: '2026-08-10', seed: 7 },
  { id: 'v3', title: 'Tenor entry cue — "Way Maker" verse 2', duration: '0:38', by: 'u5', date: '2026-08-07', seed: 11 },
  { id: 'v4', title: 'Pronunciation guide — "Imela"', duration: '2:03', by: 'u5', date: '2026-07-30', seed: 17 },
];

export const seedDebts = [
  { id: 'd1', memberId: 'u7', desc: 'Choir robe deposit', amount: 15000, paid: 5000, date: '2026-05-12' },
  { id: 'd2', memberId: 'u8', desc: 'Annual dues arrears (Q2)', amount: 12000, paid: 12000, date: '2026-04-03' },
  { id: 'd3', memberId: 'u9', desc: 'Retreat balance', amount: 30000, paid: 10000, date: '2026-06-21' },
  { id: 'd4', memberId: 'u10', desc: 'Music folder & materials', amount: 8000, paid: 0, date: '2026-07-02' },
  { id: 'd5', memberId: 'u7', desc: 'Excursion contribution', amount: 10000, paid: 4000, date: '2026-07-15' },
  { id: 'd6', memberId: 'u3', desc: 'Robe replacement', amount: 18000, paid: 6000, date: '2026-06-05' },
];

// Notice: NO "export" inside the function block!
export const seedDues = (() => {
  const arr = []; let n = 1;
  const people = ['u2', 'u3', 'u4', 'u5', 'u7', 'u8', 'u9', 'u10'];
  const weeks = [['Week 30', '2026-07-19'], ['Week 31', '2026-07-26'], ['Week 32', '2026-08-02']];
  people.forEach((pid, i) => weeks.forEach(([wk, dt], j) => {
    if ((i + j) % 4 !== 0) arr.push({ id: 'du' + n++, type: 'weekly', memberId: pid, period: wk, amount: 500, date: dt, by: 'u4' });
  }));
  arr.push({ id: 'du' + n++, type: 'absence', memberId: 'u9', period: 'Aug 9 Service', amount: 1000, date: '2026-08-10', by: 'u4' });
  arr.push({ id: 'du' + n++, type: 'absence', memberId: 'u10', period: 'Aug 2 Service', amount: 1000, date: '2026-08-03', by: 'u4' });
  arr.push({ id: 'du' + n++, type: 'lateness', memberId: 'u8', period: 'Jul 26 Rehearsal', amount: 300, date: '2026-07-27', by: 'u4' });
  arr.push({ id: 'du' + n++, type: 'lateness', memberId: 'u7', period: 'Aug 9 Rehearsal', amount: 300, date: '2026-08-10', by: 'u4' });
  return arr;
})();

// Notice: NO "export" inside the function block!
export const genSessions = () => {
  const dates = ['2026-07-19', '2026-07-26', '2026-08-02', '2026-08-09', '2026-08-16'];
  return dates.map((date, di) => ({
    id: 'att' + di, date, title: 'Sunday Worship Service',
    records: Object.fromEntries(seedUsers.map((u, i) => {
      const k = (i + di * 3) % 9;
      return [u.id, k === 4 ? 'absent' : k === 7 ? 'excused' : 'present'];
    })),
  })).reverse();
};

export const seedNominations = {
  President: ['u2', 'u8', 'u10'], 'Vice President': ['u8', 'u9'], Secretary: ['u3', 'u9'],
  Provost: ['u4', 'u10'], Custodian: ['u5', 'u7'], 'Financial Secretary': ['u7', 'u9'],
};

export const seedElections = [
  { id: 'e1', post: 'President', candidateIds: ['u2', 'u8'], status: 'closed', votes: { u2: 6, u8: 3 }, votedIds: ['u3', 'u4', 'u5', 'u6', 'u7', 'u9', 'u10', 'u2', 'u8'], choice: {}, created: '2026-08-05' },
  { id: 'e2', post: 'Secretary', candidateIds: ['u3', 'u9'], status: 'live', votes: { u3: 4, u9: 2 }, votedIds: ['u4', 'u5', 'u7', 'u8', 'u10', 'u2'], choice: {}, created: '2026-08-15' },
  { id: 'e3', post: 'Provost', candidateIds: ['u4', 'u10'], status: 'draft', votes: { u4: 0, u10: 0 }, votedIds: [], choice: {}, created: '2026-08-16' },
];

export const seedAudit = [
  { id: 'a1', userId: 'u6', action: 'ELECTION', detail: 'Created poll for Secretary post', time: '2026-08-15 11:00' },
  { id: 'a2', userId: 'u5', action: 'VOICE', detail: 'Uploaded voice guide "Soprano run — Imela bridge"', time: '2026-08-12 18:40' },
  { id: 'a3', userId: 'u2', action: 'DEBT_UPDATE', detail: 'Recorded ₦5,000 payment from Miriam Bello', time: '2026-08-11 16:30' },
  { id: 'a4', userId: 'u4', action: 'ATTENDANCE', detail: 'Marked attendance for Sunday Worship Service', time: '2026-08-09 09:45' },
  { id: 'a5', userId: 'u2', action: 'SONG_UPLOAD', detail: 'Uploaded "Nara (Receive Praise)"', time: '2026-08-03 14:02' },
  { id: 'a6', userId: 'u3', action: 'MINUTES', detail: 'Published Choir Retreat Planning minutes', time: '2026-08-01 20:15' },
  { id: 'a7', userId: 'u1', action: 'ROLE_GRANTED', detail: 'Granted Electoral Committee to David Olawale', time: '2026-07-28 09:12' },
  { id: 'a8', userId: 'u1', action: 'ROLE_GRANTED', detail: 'Granted President to Tunde Bakare', time: '2026-07-20 10:24' },
];
export const seedPendingUsers = [
  { id: 'p1', name: 'Chinedu Umeh', email: 'chinedu@gmail.com', pass: 'demo123', roles: [], voice: 'Tenor', joined: '2026-08-15', color: '#0ea5e9' },
  { id: 'p2', name: 'Blessing Okoro', email: 'blessing@gmail.com', pass: 'demo123', roles: [], voice: 'Soprano', joined: '2026-08-16', color: '#ec4899' },
];
export const seedRoleHistory = [
  { id: 'rh1', userId: 'u2', role: 'president', granted: '2026-07-20', revoked: null },
  { id: 'rh2', userId: 'u3', role: 'secretary', granted: '2026-06-01', revoked: null },
  { id: 'rh3', userId: 'u4', role: 'provost', granted: '2026-06-01', revoked: null },
  { id: 'rh4', userId: 'u5', role: 'custodian', granted: '2026-05-15', revoked: null },
  { id: 'rh5', userId: 'u6', role: 'electoral', granted: '2026-07-28', revoked: null },
  { id: 'rh6', userId: 'u5', role: 'secretary', granted: '2025-01-10', revoked: '2026-05-14' },
];
export const seedDuesSettings = [
  { id: 'ds1', amount: 500, effectiveFrom: '2026-01-01', by: 'u2', roleAtTime: 'President' },
  { id: 'ds2', amount: 700, effectiveFrom: '2026-08-01', by: 'u2', roleAtTime: 'President' },
];
export const seedAnnouncements = [
  { id: 'an1', title: 'Thanksgiving rehearsal schedule', body: 'Rehearsals hold Thursday 6pm and Saturday 4pm till the event.', by: 'u2', roleAtTime: 'President', date: '2026-08-10', pinned: true },
  { id: 'an2', title: 'Retreat balance deadline', body: 'All balances must be cleared by Aug 30.', by: 'u3', roleAtTime: 'Secretary', date: '2026-08-12', pinned: false },
];
export const seedDocuments = [
  { id: 'doc1', title: 'Choir Constitution', category: 'Constitution', version: 'v1.0', date: '2025-01-20', by: 'u1', roleAtTime: 'Admin', desc: 'First ratified constitution', size: '1.2 MB' },
  { id: 'doc2', title: 'Choir Constitution', category: 'Constitution', version: 'v2.0', date: '2026-02-10', by: 'u1', roleAtTime: 'Admin', desc: 'Amended edition (current)', size: '1.4 MB' },
  { id: 'doc3', title: 'July General Meeting Minutes', category: 'Minutes', version: 'v1.0', date: '2026-07-05', by: 'u3', roleAtTime: 'Secretary', desc: '', size: '220 KB' },
  { id: 'doc4', title: 'Robe cleaning receipt', category: 'Receipts', version: 'v1.0', date: '2026-07-08', by: 'u3', roleAtTime: 'Secretary', desc: '', size: '140 KB' },
];
export const seedProbations = [
  { id: 'pr1', memberId: 'u8', reason: 'Repeated lateness (3 strikes)', start: '2026-07-01', end: '2026-09-01', by: 'u4', roleAtTime: 'Provost', status: 'active', history: [{ ev: 'Started', date: '2026-07-01' }] },
  { id: 'pr2', memberId: 'u10', reason: 'Misconduct at rehearsal', start: '2026-05-01', end: '2026-07-01', by: 'u4', roleAtTime: 'Provost', status: 'released', history: [{ ev: 'Started', date: '2026-05-01' }, { ev: 'Released', date: '2026-07-01' }] },
];
export const seedNotifs = [
  { id: 'n1', text: 'New announcement: Thanksgiving rehearsal schedule', date: '2026-08-10', readBy: [] },
  { id: 'n2', text: 'Constitution v2.0 uploaded', date: '2026-02-10', readBy: [] },
];
export const seedPendingNoms = [];