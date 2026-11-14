// Reads what people type to the duty assistant. No AI: a few plain sentence shapes, e.g.
//   assign Grace to lead the offertory hymn on Sunday
//   Grace and Tobi - first reading - 16 Nov
//   my duties · duties of Grace · open duties · accept 12 · done 12 · can't 12 busy that day · cancel 12 · help
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = `(${MONTHS.join('|')})[a-z]*\\.?`;

const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (today, n) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const build = (y, m, d) => { const dt = new Date(Date.UTC(y, m, d)); return dt.getUTCMonth() === m && dt.getUTCDate() === d ? ymd(dt) : null; };
// A date without a year means the next time that day comes round
const upcoming = (today, m, d) => {
  const y = +today.slice(0, 4);
  const t = build(y, m, d);
  return t && t < today ? build(y + 1, m, d) : t;
};

// Finds a date phrase at the end of the text (optionally after on/by/for/-) and returns it with the text before it
const DATE_PATTERNS = [
  [/(today|tonight)$/, (m, today) => today],
  [/tomorrow$/, (m, today) => addDays(today, 1)],
  [/(next|this)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/, (m, today) => {
    const want = DAYS.indexOf(m[2]);
    const now = new Date(`${today}T00:00:00Z`).getUTCDay();
    let diff = (want - now + 7) % 7;
    if (m[1] === 'next' && diff === 0) diff = 7;
    return addDays(today, diff);
  }],
  [/(\d{4})-(\d{2})-(\d{2})$/, (m) => build(+m[1], +m[2] - 1, +m[3])],
  [/(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (m) => build(+m[3], +m[2] - 1, +m[1])],
  [/(\d{1,2})\/(\d{1,2})$/, (m, today) => upcoming(today, +m[2] - 1, +m[1])],
  [new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}(?:\\s+(\\d{4}))?$`), (m, today) => (m[3] ? build(+m[3], MONTHS.indexOf(m[2]), +m[1]) : upcoming(today, MONTHS.indexOf(m[2]), +m[1]))],
  [new RegExp(`${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?$`), (m, today) => (m[3] ? build(+m[3], MONTHS.indexOf(m[1]), +m[2]) : upcoming(today, MONTHS.indexOf(m[1]), +m[2]))],
];
const takeDate = (text, today) => {
  const t = text.trim();
  const lower = t.toLowerCase();
  for (const [re, fn] of DATE_PATTERNS) {
    const m = re.exec(lower);
    if (!m) continue;
    const date = fn(m, today);
    if (!date) return { date: null, rest: t, bad: true };
    const rest = t.slice(0, m.index).replace(/[\s,–—-]*(on|by|for|due|before)?[\s,–—:-]*$/i, '').trim();
    return { date, rest };
  }
  return { date: null, rest: t };
};

// Reads one or more member names from the start of the text ("Grace", "Grace Okafor", "Grace and Tobi, Ada")
const takeNames = (text, members) => {
  let rest = text.trim().replace(/^@/, '');
  const found = [];
  const people = members.map((m) => ({ m, full: m.name.toLowerCase(), first: m.name.toLowerCase().split(' ')[0] }));
  for (;;) {
    const lower = rest.toLowerCase();
    const boundary = (s) => lower.startsWith(s) && !/[a-z]/.test(lower.charAt(s.length));
    const full = people.filter((p) => boundary(p.full)).sort((a, b) => b.full.length - a.full.length);
    let pick = full[0];
    let used = pick && pick.full.length;
    if (!pick) {
      const byFirst = people.filter((p) => boundary(p.first));
      if (byFirst.length > 1) return { found, rest, ambiguous: byFirst.map((p) => p.m.name) };
      [pick] = byFirst;
      used = pick && pick.first.length;
    }
    if (!pick) break;
    if (!found.includes(pick.m)) found.push(pick.m);
    rest = rest.slice(used).trim();
    const joiner = /^(,|and\b|&)\s*@?/i.exec(rest);
    if (!joiner) break;
    const after = rest.slice(joiner[0].length);
    const next = after.toLowerCase();
    if (!people.some((p) => next.startsWith(p.first))) break;
    rest = after;
  }
  return { found, rest };
};

const interpret = (raw, { members, today }) => {
  const text = String(raw || '').trim().replace(/\s+/g, ' ');
  const lower = text.toLowerCase();
  if (!text) return { kind: 'empty' };
  if (/^(help|\?|hi|hello|hey|start|menu)\b/.test(lower)) return { kind: 'help' };
  if (/^(my (duties|tasks|responsibilities)|what are my (duties|tasks))\b/.test(lower)) return { kind: 'mine' };
  if (/^(open|all|pending) (duties|tasks)\b|^(duties|tasks)$/.test(lower)) return { kind: 'open' };

  const status = /^(accept(ed)?|yes|ok(ay)?|done|finished|completed|decline|declined|no|can'?t|cannot|cancel)\s*#?(\d+)?\s*(.*)$/i.exec(text);
  if (status) {
    const word = status[1].toLowerCase();
    const action = /^(accept|yes|ok)/.test(word) ? 'accept' : /^(done|finished|completed)/.test(word) ? 'done' : word === 'cancel' ? 'cancel' : 'decline';
    return { kind: 'status', action, num: status[4] ? +status[4] : null, note: status[5] || '' };
  }

  const of = /^(?:duties|tasks) (?:of|for) (.+)$|^(.+?)'s (?:duties|tasks)$/i.exec(text);
  if (of) {
    const { found, ambiguous } = takeNames(of[1] || of[2], members);
    if (ambiguous) return { kind: 'ambiguous', names: ambiguous };
    return found.length ? { kind: 'dutiesOf', member: found[0] } : { kind: 'unknownName', text: of[1] || of[2] };
  }

  // Assignments: "assign Grace to X on Sunday", "give Grace X", "Grace - X - Sunday"
  const verb = /^(assign|give|ask|tell|have|let)\s+/i.exec(text);
  const body = verb ? text.slice(verb[0].length) : text;
  const { found, rest, ambiguous } = takeNames(body, members);
  if (ambiguous) return { kind: 'ambiguous', names: ambiguous };
  if (!found.length) return verb ? { kind: 'unknownName', text: body } : { kind: 'unknown' };
  const task = rest.replace(/^(to|with|:|-|–|—)\s*/i, '');
  const { date, rest: title, bad } = takeDate(task, today);
  if (bad) return { kind: 'badDate' };
  const clean = title.replace(/^(to|:|-|–|—)\s*/i, '').replace(/[.\s]+$/, '');
  if (!clean) return { kind: 'noTask', members: found };
  return { kind: 'assign', members: found, title: clean.charAt(0).toUpperCase() + clean.slice(1), due: date };
};

module.exports = { interpret, takeDate, takeNames };
