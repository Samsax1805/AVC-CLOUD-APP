// Demo users for testing
export const demoUsers = [
  { id: '1', name: 'Adaeze Okafor', email: 'admin@choircloud.com', pass: 'demo123', roles: ['admin'], voice: 'Alto', color: '#b45309' },
  { id: '2', name: 'Tunde Bakare', email: 'president@choircloud.com', pass: 'demo123', roles: ['president'], voice: 'Tenor', color: '#6d28d9' },
  { id: '3', name: 'Grace Eze', email: 'secretary@choircloud.com', pass: 'demo123', roles: ['secretary'], voice: 'Soprano', color: '#0369a1' },
  { id: '4', name: 'Samuel Adeyemi', email: 'provost@choircloud.com', pass: 'demo123', roles: ['provost'], voice: 'Bass', color: '#047857' },
  { id: '5', name: 'Ruth Chukwu', email: 'custodian@choircloud.com', pass: 'demo123', roles: ['custodian'], voice: 'Alto', color: '#be123c' },
  { id: '6', name: 'David Olawale', email: 'electoral@choircloud.com', pass: 'demo123', roles: ['electoral'], voice: 'Tenor', color: '#4338ca' },
  { id: '7', name: 'Miriam Bello', email: 'miriam@choircloud.com', pass: 'demo123', roles: ['member'], voice: 'Soprano', color: '#475569' },
];

// Mock data for all features
export const mockSongs = [
  { id: 's1', title: 'Amazing Grace', composer: 'John Newton', category: 'Hymn', duration: '4:32', uploaded: '2024-01-15' },
  { id: 's2', title: 'How Great Thou Art', composer: 'Carl Boberg', category: 'Hymn', duration: '5:10', uploaded: '2024-01-20' },
  { id: 's3', title: 'Oceans', composer: 'Hillsong', category: 'Worship', duration: '8:45', uploaded: '2024-02-01' },
];

export const mockMinutes = [
  { id: 'm1', title: 'January Meeting', date: '2024-01-10', author: 'Grace Eze', status: 'approved' },
  { id: 'm2', title: 'February Meeting', date: '2024-02-08', author: 'Grace Eze', status: 'draft' },
];

export const mockAttendance = [
  { id: 'a1', date: '2024-01-10', status: 'present', members: 45 },
  { id: 'a2', date: '2024-01-17', status: 'present', members: 42 },
  { id: 'a3', date: '2024-01-24', status: 'late', members: 38 },
];

export const mockDebts = [
  { id: 'd1', member: 'John Doe', amount: 5000, reason: 'Late fee', date: '2024-01-15', status: 'pending' },
  { id: 'd2', member: 'Jane Smith', amount: 3000, reason: 'Absence', date: '2024-01-20', status: 'paid' },
];

export const mockDues = [
  { id: 'du1', member: 'John Doe', month: 'January 2024', amount: 2000, status: 'paid', date: '2024-01-05' },
  { id: 'du2', member: 'Jane Smith', month: 'January 2024', amount: 2000, status: 'pending', date: '2024-01-10' },
];

export const mockElections = [
  { id: 'e1', title: 'President Election 2024', status: 'upcoming', startDate: '2024-03-01', endDate: '2024-03-15' },
];

export const mockAnnouncements = [
  { id: 'an1', title: 'Rehearsal Schedule Update', content: 'New rehearsal times starting next week', date: '2024-01-25', author: 'President' },
];