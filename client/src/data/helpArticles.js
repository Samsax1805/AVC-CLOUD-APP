// Help Centre guides, written for Choir Cloud as it works now (November 2026).
// who: 'everyone', or the roles a guide is for (shown first under "Guides for you" to people who hold them).
// go: the page the guide's button opens.
export const HELP_GROUPS = [
  ['start', 'Getting started'],
  ['everyday', 'Everyday use'],
  ['music', 'Music'],
  ['office', 'For officers'],
];

export const HELP_ARTICLES = [
  // ---------- getting started ----------
  {
    id: 'signin', group: 'start', who: 'everyone', title: 'Signing in and forgotten passwords',
    summary: 'Register, sign in with email or Google, and reset a forgotten password.',
    tags: 'login register account password google locked reset code',
    steps: [
      'New to the choir? On the sign-in page choose Register, enter your details (or use Continue with Google), and wait: the President or Provost approves new accounts.',
      'Added by an officer? You get a welcome email with how to sign in, so there is no need to register.',
      'Forgot your password? Choose Forgot password, enter your email, and type the code you receive to set a new one.',
    ],
    tips: [
      'After a few wrong passwords the account locks for a short while to keep it safe, and the admins are told. Wait, then try again, or use Forgot password.',
      'Officers will never ask for your password.',
    ],
  },
  {
    id: 'app', group: 'start', who: 'everyone', title: 'Put Choir Cloud on your phone',
    summary: 'Install it like an app and get choir news as notifications.',
    tags: 'install app home screen phone android iphone notifications push',
    steps: [
      'Android (Chrome): open avcsb.com and tap Install app when it is offered, or use the ⋮ menu → Add to Home screen.',
      'iPhone (Safari): open avcsb.com, tap Share → Add to Home Screen, then open Choir Cloud from the new icon.',
      'Then turn on notifications: My Account → Notifications → Turn on notifications.',
    ],
    tips: ['On iPhone, notifications only work once the site has been added to the Home Screen.'],
    go: { page: 'profile', tab: 'notifications', label: 'Open notification settings' },
  },
  {
    id: 'around', group: 'start', who: 'everyone', title: 'Finding your way around',
    summary: 'The menu, the bell, search, messages and dark mode.',
    tags: 'menu navigation bell search ctrl k messages dark mode sign out',
    steps: [
      'Menu (left, or ☰ on a phone): every page you can use. Officers see extra pages for their office.',
      'Bell (top right): choir notices such as new announcements, elections, new music and birthdays. A red dot means something new.',
      'Search (top): find pages, members, songs, documents, minutes and notices. Press Ctrl+K on a computer to jump to it.',
      'Messages (bottom right): private chats and the duty assistant.',
      'Sign out is next to your name at the bottom of the menu. Dark Mode is in the menu too.',
    ],
    go: { page: 'dashboard', label: 'Go to the Dashboard' },
  },
  {
    id: 'account', group: 'start', who: 'everyone', title: 'My Account: your details, notifications and security',
    summary: 'Your attendance, dues and duties at a glance, your details, and how you sign in.',
    tags: 'my account settings profile part voice birthday phone security password sign out devices overview',
    steps: [
      'Open My Account in the menu. Overview shows your attendance, dues, debts and what is coming up.',
      'Profile: update your name, date of birth (for the choir\'s birthday wishes 🎂), country, phone and the part you sing, then Save details.',
      'Notifications: turn phone notifications on or off for this device.',
      'Security: change your password, see where your account is signed in, and Sign out of other devices if you used a shared phone.',
    ],
    go: { page: 'profile', tab: 'overview', label: 'Open My Account' },
  },

  // ---------- everyday ----------
  {
    id: 'checkin', group: 'everyday', who: 'everyone', title: 'Checking in at rehearsal or Mass',
    summary: 'Use the Provost\'s QR code to mark yourself present.',
    tags: 'attendance check in qr code present scan',
    steps: [
      'When the Provost shows the check-in QR code, open Attendance.',
      'Scan the code (or paste it) into Check in with code and press Check in.',
      'Your attendance rate and every session recorded are on the same page.',
    ],
    tips: ['Each code lasts about 90 seconds and works once per person. Check in while you are there.'],
    go: { page: 'attendance', label: 'Open Attendance' },
  },
  {
    id: 'calendar', group: 'everyday', who: 'everyone', title: 'Calendar and the Sunday songs',
    summary: 'Rehearsals, services, birthdays, psalmists and the songs planned for each day.',
    tags: 'calendar events rehearsal service setlist sunday songs birthdays',
    steps: [
      'Open Calendar to see rehearsals, services and meetings, who is the psalmist, and birthdays.',
      'Days with a published song list show the songs in order. Tap a song to play it or open its score.',
      'Your own coming duties and songs also appear on My Account → Overview.',
    ],
    go: { page: 'calendar', label: 'Open the Calendar' },
  },
  {
    id: 'psalmists', group: 'everyday', who: 'everyone', title: 'The psalmist roster',
    summary: 'See the published roster and your own days, with reminders.',
    tags: 'psalmist roster psalm reminder duty',
    steps: [
      'Open Psalmists to see the published roster, following the Catholic calendar. Your days are highlighted; tick Only mine to see just yours.',
      'You are reminded in Messages and by email two weeks and one week before your day.',
      'Download PDF gives you the roster to print or share.',
    ],
    go: { page: 'psalmists', label: 'Open Psalmists' },
  },
  {
    id: 'messages', group: 'everyday', who: 'everyone', title: 'Messages and the duty assistant',
    summary: 'Private chats with members, and your duties and reminders.',
    tags: 'messages chat private duty assistant duties accept done',
    steps: [
      'Press Messages at the bottom right, then New, choose a member and type. Only the two of you see the chat.',
      'The duty assistant lists your duties and psalmist reminders. Type my duties to see yours, or accept 12, done 12 or can\'t 12 busy to answer duty number 12.',
      'Officers who assign duties can type a sentence such as "assign Grace to lead the offertory hymn on Sunday". Type help for every command.',
    ],
  },
  {
    id: 'elections', group: 'everyday', who: 'everyone', title: 'Elections: nominating, volunteering and voting',
    summary: 'Take part when the Electoral Committee opens an election.',
    tags: 'election nominate volunteer vote ballot run-off results secret',
    steps: [
      'You get a notification and a Dashboard banner when an election opens.',
      'Nominations: for each office choose one eligible member. You can also put yourself forward with Volunteer. You can change or withdraw until nominations close.',
      'Voting: when voting is live, choose a candidate for each office and press Cast vote. One vote per office, and your ballot is secret.',
      'If two candidates tie, you may be asked to vote again between them. Results appear once the committee publishes them.',
    ],
    tips: ['Nobody, not even the admin, can see who you voted for.'],
    go: { page: 'elections', label: 'Open Elections' },
  },
  {
    id: 'money', group: 'everyday', who: 'everyone', title: 'Your dues and debts',
    summary: 'What you have paid and anything you owe the choir.',
    tags: 'dues debts owe paid lira fines',
    steps: [
      'My Account → Overview shows your dues this year and anything you owe.',
      'My Debts lists each debt (for example a robe deposit), what you have paid and what is left. Amounts are in Turkish Lira (₺).',
      'Only you and the officers who manage money can see your debts.',
    ],
    go: { page: 'debts', label: 'Open My Debts' },
  },
  {
    id: 'reading', group: 'everyday', who: 'everyone', title: 'Announcements, documents, minutes and finance reports',
    summary: 'Read the choir\'s notices and records, and open files safely.',
    tags: 'announcements documents minutes constitution finance report pdf open download',
    steps: [
      'Announcements: official notices (the newest also appear on your Dashboard).',
      'Documents: the constitution, programmes and records. Minutes: published records of meetings.',
      'Finance Reports: each month\'s report once it is published.',
      'Opening a file shows it in a new tab from the choir\'s own address. On phones that cannot show PDFs it downloads with its real name.',
    ],
    go: { page: 'documents', label: 'Open Documents' },
  },
  {
    id: 'oldmember', group: 'everyday', who: 'everyone', title: 'Old Members',
    summary: 'What stays available when you move on from the active choir.',
    tags: 'old member alumni',
    steps: [
      'The President may make you an Old Member when you leave the active choir.',
      'You keep your account to follow the choir: notices, announcements, music and published results, and you can still download files.',
      'You no longer appear in attendance, dues, nominations or voting.',
    ],
  },

  // ---------- music ----------
  {
    id: 'library', group: 'music', who: 'everyone', title: 'Finding and practising music',
    summary: 'Search the library, play your part and download scores.',
    tags: 'music library songs catalogue search part soprano alto tenor bass download score play chr ins',
    steps: [
      'Open Music & Files. The Catalogue at the top lists approved music with its number: CHR for songs, INS for instrumental pieces.',
      'Search by title, number, composer, first line or language, and switch between Songs and Instrumental.',
      'Open a song to see its files with your own voice part first, its details (key, tempo, season, Mass part) and copyright.',
      'Play recordings, or open / download scores to practise.',
    ],
    tips: [
      'A song marked "Urgent · not yet reviewed" was published quickly because it was needed (for example for Sunday). It gets its number once it has been approved.',
      'Each card shows the first page of the score. Dots show which voice parts have their own file.',
    ],
    go: { page: 'music', label: 'Open Music & Files' },
  },
  {
    id: 'voicenotes', group: 'music', who: 'everyone', title: 'Voice notes',
    summary: 'Short practice recordings from the Choir Master or Custodian.',
    tags: 'voice notes recording practice',
    steps: ['Open Voice Notes to hear short recordings: a tricky entry, a pronunciation guide or a correction from rehearsal.'],
    go: { page: 'voice', label: 'Open Voice Notes' },
  },
  {
    id: 'upload', group: 'music', who: ['custodian', 'choirmaster', 'asstchoirmaster', 'president', 'admin'], title: 'Adding music: the Upload queue',
    summary: 'The one way to add music: upload, fill in the details, send for approval.',
    tags: 'upload music song score pdf queue details send approval claim duplicate recording link custodian',
    steps: [
      'Press New Upload in the menu (or Music & Files → Upload music). This opens the Upload queue.',
      'Drop score copies (PDF, picture, MusicXML or MuseScore), audio, MIDI or video: several at once, up to 100 MB each. Each is saved straight away with a queue number such as Q-0042. Only a recording? Paste its link.',
      'Open the item and fill in its details. Each field saves by itself; there is no Save button. Add part scores and recordings from the item\'s page.',
      'When the checklist shows 10 of 10, press Send for approval. The details lock while the approvers look.',
    ],
    tips: [
      'Press Claim so others know you are working on an item. Two people changing the same field are asked "Keep theirs" or "Use mine", so nothing is overwritten.',
      'If the same file is uploaded twice, the queue offers Merge or Keep.',
      'Sent back? The approver\'s reason shows on the item. Make the change and send it again.',
    ],
    go: { page: 'music', musicTab: 'queue', label: 'Open the Upload queue' },
  },
  {
    id: 'approve', group: 'music', who: ['choirmaster', 'asstchoirmaster', 'president', 'admin'], title: 'Approving music',
    summary: 'Approve, send back or publish music; urgent publishing; Music Approvers.',
    tags: 'approve approval send back publish urgent chr ins number seal music approvers choir master assistant',
    steps: [
      'Music & Files → Approvals lists music waiting for approval. Press Review to see everything about it.',
      'Send back with a short reason, or press Approve: it shows the number it will get (CHR for songs, INS for instrumentals).',
      'Choose to publish now, on a date, or later (hold). Members get one notification when it is published.',
      'Need something straight away? On an item in the queue press ⚡ Urgent: publish now and give a reason. Members can use it at once, marked "not yet reviewed".',
    ],
    tips: [
      'Anyone given the Choir Master or Assistant Choir Master role approves music automatically. They can also bring other members on board as Music Approvers. The President and admin are the back-up.',
      'Each approval is sealed to the exact files approved, and approving music you sent yourself is recorded as "self-approved".',
    ],
    go: { page: 'music', musicTab: 'approvals', label: 'Open Approvals' },
  },
  {
    id: 'setlists', group: 'music', who: ['choirmaster', 'asstchoirmaster', 'president', 'admin'], title: 'Planning the Sunday songs',
    summary: 'Choose the songs for a day and publish them to the choir.',
    tags: 'setlist sunday songs plan calendar publish',
    steps: [
      'Open Calendar, pick the day and press Plan songs.',
      'Add songs from the library in order, with a label (Entrance, Offertory, Communion…) and a note if needed.',
      'Save as a draft, or Publish: members are told and see the songs on the Calendar and My Account.',
    ],
    go: { page: 'calendar', label: 'Open the Calendar' },
  },

  // ---------- officers ----------
  {
    id: 'psalmplan', group: 'office', who: ['choirmaster', 'asstchoirmaster', 'president', 'admin'], title: 'Planning the psalmist roster',
    summary: 'Build the year, assign psalmists and publish.',
    tags: 'psalmist roster plan generate assign publish csv',
    steps: [
      'Open Psalmists, choose the year and press Generate (or Add missing days). Every Sunday and main feast is added with its liturgical title.',
      'Press Assign on a day and pick up to 4 members. The number beside each name shows how many days they already have.',
      'Tick the days and press Publish. Only published days are visible to members.',
    ],
    tips: ['Prefer a spreadsheet? Use CSV to download, edit and upload again. You see the changes before anything is saved.'],
    go: { page: 'psalmists', label: 'Open Psalmists' },
  },
  {
    id: 'attendance', group: 'office', who: ['provost', 'president', 'admin'], title: 'Taking attendance',
    summary: 'Show the check-in code and mark the rest.',
    tags: 'attendance qr generate mark present absent late excused provost',
    steps: [
      'Open Attendance and check the session date and title.',
      'Press Generate QR and show it. Members scan to check in. Each code lasts about 90 seconds; make a new one as needed.',
      'Mark anyone else P (present), A (absent), L (late) or E (excused). Each mark saves on its own.',
    ],
    go: { page: 'attendance', label: 'Open Attendance' },
  },
  {
    id: 'dues', group: 'office', who: ['provost', 'president', 'admin'], title: 'Dues records and probation',
    summary: 'Record weekly, absence and lateness dues; manage probation.',
    tags: 'dues record weekly absence lateness probation provost',
    steps: [
      'Dues Records: press Record to log a weekly, absence or lateness due for a member. The weekly amount is set by the President or admin.',
      'Probation: press Add probation, choose the member, the reason and the end date. You can extend or release it later; the full history is kept.',
    ],
    go: { page: 'dues', label: 'Open Dues Records' },
  },
  {
    id: 'members', group: 'office', who: ['pro', 'provost', 'president', 'admin'], title: 'Adding members and setting parts',
    summary: 'Bring new members in and keep everyone\'s part up to date.',
    tags: 'add member pro part voice welcome email approve pending',
    steps: [
      'Open Members & Roles and press Add member: name, email, phone and part. They get a welcome email with how to sign in.',
      'Change a member\'s part with the Voice choice beside their name. It saves at once.',
      'New registrations wait under Pending approvals for the President or Provost to approve.',
    ],
    go: { page: 'members', label: 'Open Members & Roles' },
  },
  {
    id: 'roles', group: 'office', who: ['president', 'admin'], title: 'Roles, debts and oversight (President)',
    summary: 'Grant roles, manage debts and follow the choir\'s records.',
    tags: 'president roles grant remove old member deactivate debts audit security',
    steps: [
      'Members & Roles: choose a role beside a member and press Grant; press × on a role to remove it. Choose Old Member when someone leaves the active choir.',
      'Giving someone the Choir Master or Assistant Choir Master role also lets them approve music.',
      'Debt Tracker: Add debt for a member, and Record payment when they pay.',
      'You can also see the Audit Log and the Security page, and appoint the Electoral Committee.',
    ],
    go: { page: 'members', label: 'Open Members & Roles' },
  },
  {
    id: 'secretary', group: 'office', who: ['secretary', 'president', 'admin'], title: 'Announcements, minutes, receipts and documents (Secretary)',
    summary: 'Publish the choir\'s notices and records.',
    tags: 'secretary announcement minutes receipt document upload publish',
    steps: [
      'Announcements: New announcement, write it, then Publish. It appears on every member\'s Dashboard.',
      'Minutes: New minutes, enter the meeting title and the record, then Publish.',
      'Receipts: Add receipt with what it was for, the amount, the category and a photo or PDF.',
      'Documents: Upload document with a category (Constitution, Administrative, Financial…) and a version.',
    ],
    go: { page: 'announcements', label: 'Open Announcements' },
  },
  {
    id: 'finance', group: 'office', who: ['finance', 'secretary', 'president', 'admin'], title: 'Monthly finance reports',
    summary: 'The Finance Secretary writes the month, the Secretary reviews it, then it is published.',
    tags: 'finance report month income expense rates dues publish review return finance secretary',
    steps: [
      'Finance Secretary: open Finance Reports, choose the month, and enter income, expenses and exchanges. A month\'s Dues Records can be brought in.',
      'Press Send to the Secretary. The Secretary approves and publishes it, or returns it with comments.',
      'Returned? The comments show at the top. Make the changes and send it again.',
      'Published reports are visible to members. A Draft PDF can be downloaded at any time.',
    ],
    go: { page: 'finance', label: 'Open Finance Reports' },
  },
  {
    id: 'electoral', group: 'office', who: ['electoral', 'president', 'admin'], title: 'Running an election (Electoral Committee)',
    summary: 'Offices, nominations, candidates, voting and results.',
    tags: 'electoral committee election offices eligible nominations candidates go live results run-off practice',
    steps: [
      'Start an election, add the offices and, for each, the eligible members. Members see nothing yet.',
      'Publish for nominations (members nominate or volunteer), or skip nominations and choose the candidates yourselves.',
      'Close nominations, tick the candidates (at least 2 per office) and Publish candidates. The President or admin presses Go live.',
      'Close voting, call a run-off for any tie, then publish the results.',
    ],
    tips: ['New to it? Run a practice election first: it works the same way, is marked "Practice" everywhere, and is deleted when you end it.'],
    go: { page: 'elections', label: 'Open Elections' },
  },
  {
    id: 'admin', group: 'office', who: ['admin'], title: 'Admin: security, Audit Log and the admin role',
    summary: 'Watch sign-ins and alerts, follow every action, hand over admin safely.',
    tags: 'admin security audit log alerts locked accounts unlock sign out handover forfeit',
    steps: [
      'Security: sign-ins today, failed sign-ins, locked accounts and alerts. Unlock an account or sign a member out of all devices.',
      'Audit Log: every action across the site, a page at a time, with search and filters.',
      'Giving someone the admin role, or giving up your own, needs your password and a confirmation word. The last admin cannot be removed.',
    ],
    go: { page: 'security', label: 'Open Security' },
  },
];

export const HELP_FAQ = [
  ['I registered but can\'t sign in.', 'Your account is waiting for the President or Provost to approve it. Let one of them know.'],
  ['My account says it is locked.', 'Too many wrong passwords. Wait a few minutes and try again, or use Forgot password on the sign-in page.'],
  ['I don\'t see a page an officer mentioned.', 'Some pages are only for certain offices. Ask the President or admin to check your roles.'],
  ['I\'m not getting notifications on my phone.', 'Open My Account → Notifications and turn them on. On iPhone, add Choir Cloud to the Home Screen first.'],
  ['The check-in code says it has expired.', 'Codes last about 90 seconds. Ask the Provost to show a fresh one.'],
  ['A song I need isn\'t in the library.', 'New music appears once it has been approved. Ask the Custodian or Choir Master; if it is needed for Sunday, they can publish it urgently.'],
  ['Someone else changed a detail I was editing.', 'Nothing is overwritten: the field shows what they changed and asks Keep theirs or Use mine.'],
  ['Can anyone see how I voted?', 'No. Ballots are secret, even from the admin.'],
  ['Who can see my debts and messages?', 'Your debts are seen only by you and the officers who manage money. Private chats are only between you and the other person.'],
];

export const HELP_SAFETY = [
  'Use a password you don\'t use anywhere else, and never share it. Officers will never ask for it.',
  'On a shared phone, sign out when you finish. If you forget, use My Account → Security → Sign out of other devices.',
  'If you get an alert that your account was used on a new device and it wasn\'t you, change your password straight away and tell the admin.',
];
