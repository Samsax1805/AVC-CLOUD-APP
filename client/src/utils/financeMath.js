// Finance report maths, shared by the website, the PDF and the server (server/services/financeMath.js loads this file).
// Money is worked in whole cents ("minor units") so totals never drift the way 0.1 + 0.2 does.
// No imports: this file must run unchanged in the browser and in Node.

export const UNITEMISED = 'To Be Itemised';
export const TYPES = ['income', 'expense', 'exchange'];

export const toMinor = (x) => {
  const n = Number(String(x ?? '').replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
export const fromMinor = (m) => Math.round(m) / 100;
const inBase = (minor, rate) => Math.round(minor * (Number(rate) || 0));

export const monthAfter = (ym) => {
  const [y, m] = String(ym).split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
export const monthBefore = (ym) => {
  const [y, m] = String(ym).split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthLabel = (ym) => {
  const [y, m] = String(ym || '').split('-').map(Number);
  return y && m ? `${MONTHS[m - 1]} ${y}` : '';
};
export const shortMonth = (ym) => {
  const [y, m] = String(ym || '').split('-').map(Number);
  return y && m ? `${MONTHS[m - 1].slice(0, 3)} ${y}` : '';
};
export const monthDays = (ym) => {
  const [y, m] = String(ym).split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

// "22,401" for whole amounts, "22,401.50" otherwise; negatives as "-2,105"
export const fmtNum = (minor, { decimals } = {}) => {
  const m = Math.round(Number(minor) || 0);
  const d = decimals ?? (m % 100 === 0 ? 0 : 2);
  return (m / 100).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
};
export const fmtMoney = (minor, code, opts) => `${code ? `${code} ` : ''}${fmtNum(minor, opts)}`;
export const fmtPct = (p) => (p == null || !Number.isFinite(p) ? '' : `${(p * 100).toFixed(p >= 0.995 || p === 0 ? 0 : 1)}%`);

const rateFor = (book, sheet, code) => {
  if (code === book.base) return 1;
  const r = Number(sheet?.rates?.[code]);
  if (Number.isFinite(r) && r > 0) return r;
  const c = (book.currencies || []).find((x) => x.code === code);
  return Number(c?.rate) || 0;
};

// Currencies in the book's order, plus any an entry still uses after it was taken off the list
const currencyList = (book, sheet) => {
  const list = (book.currencies || []).map((c) => ({ code: c.code, name: c.name || c.code, symbol: c.symbol || '' }));
  for (const e of sheet?.entries || []) {
    for (const code of [e.currency, e.toCurrency]) {
      if (code && !list.some((c) => c.code === code)) list.push({ code, name: code, symbol: '' });
    }
  }
  return list;
};

const ordered = (map, preferred) => {
  const names = [...preferred.filter((n) => map.has(n)), ...[...map.keys()].filter((n) => !preferred.includes(n)).sort()];
  return names.map((name) => ({ name, amount: map.get(name) }));
};

// One month. `bf` = { code: minor } carried in from the month before (or the opening balances).
export function computeSheet(book, sheet, bf = {}) {
  const currencies = currencyList(book, sheet);
  const by = {};
  for (const c of currencies) {
    const rate = rateFor(book, sheet, c.code);
    by[c.code] = { ...c, rate, bf: Math.round(bf[c.code] || 0), inc: 0, exp: 0, ex: 0, incBase: 0, expBase: 0, exBase: 0 };
  }
  const income = new Map();
  const expense = new Map();
  const funds = new Map();
  const fund = (name) => {
    const k = name || 'No fund given';
    if (!funds.has(k)) funds.set(k, { name: k, inc: 0, exp: 0 });
    return funds.get(k);
  };
  let unitemised = 0;
  let exchanges = 0;
  for (const e of sheet?.entries || []) {
    const amt = toMinor(e.amount);
    if (!amt || !by[e.currency]) continue;
    const row = by[e.currency];
    if (e.type === 'exchange') {
      const to = by[e.toCurrency];
      const got = toMinor(e.toAmount);
      if (!to || !got || e.toCurrency === e.currency) continue;
      row.ex -= amt; row.exBase -= inBase(amt, row.rate);
      to.ex += got; to.exBase += inBase(got, to.rate);
      exchanges += 1;
      continue;
    }
    const base = inBase(amt, row.rate);
    const cat = String(e.category || '').trim() || 'Not given';
    if (e.type === 'income') {
      row.inc += amt; row.incBase += base;
      income.set(cat, (income.get(cat) || 0) + base);
      fund(e.fund).inc += base;
    } else if (e.type === 'expense') {
      row.exp += amt; row.expBase += base;
      expense.set(cat, (expense.get(cat) || 0) + base);
      fund(e.fund).exp += base;
      if (cat === UNITEMISED) unitemised += base;
    }
  }
  const rows = currencies.map((c) => {
    const r = by[c.code];
    r.close = r.bf + r.inc - r.exp + r.ex;
    r.bfBase = inBase(r.bf, r.rate);
    // Worked from the parts so every column adds up exactly: B/F + income - expenses (+ exchanges) = closing
    r.closeBase = r.bfBase + r.incBase - r.expBase + r.exBase;
    return r;
  });
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  const combined = { bf: sum('bfBase'), inc: sum('incBase'), exp: sum('expBase'), ex: sum('exBase'), close: sum('closeBase') };
  const withPct = (list, total) => list.map((x) => ({ ...x, pct: total ? x.amount / total : null }));
  const memberRows = (sheet?.members || []).map((m) => ({ ...m, duesMinor: toMinor(m.dues), latenessMinor: toMinor(m.lateness) }))
    .map((m) => ({ ...m, totalMinor: m.duesMinor + m.latenessMinor }));
  const fundOrder = book.funds || [];
  return {
    month: sheet?.month,
    label: monthLabel(sheet?.month),
    base: book.base,
    currencies: rows,
    byCode: Object.fromEntries(rows.map((r) => [r.code, r])),
    combined,
    income: withPct(ordered(income, book.incomeCats || []), combined.inc),
    expense: withPct(ordered(expense, book.expenseCats || []), combined.exp),
    funds: [...fundOrder.filter((n) => funds.has(n)), ...[...funds.keys()].filter((n) => !fundOrder.includes(n)).sort()]
      .map((n) => ({ ...funds.get(n), net: funds.get(n).inc - funds.get(n).exp })),
    members: {
      rows: memberRows,
      dues: memberRows.reduce((a, m) => a + m.duesMinor, 0),
      lateness: memberRows.reduce((a, m) => a + m.latenessMinor, 0),
      total: memberRows.reduce((a, m) => a + m.totalMinor, 0),
    },
    unitemised,
    exchanges,
    entryCount: (sheet?.entries || []).length,
  };
}

export const openingOf = (book) => Object.fromEntries((book.currencies || []).map((c) => [c.code, toMinor(c.opening)]));

// Every month of a book in order; each month starts from where the month before ended
export function computeBook(book, sheets) {
  const sorted = [...(sheets || [])].sort((a, b) => (a.month < b.month ? -1 : 1));
  let carry = openingOf(book);
  return sorted.map((s) => {
    const r = computeSheet(book, s, carry);
    carry = Object.fromEntries(r.currencies.map((c) => [c.code, c.close]));
    return r;
  });
}

// What a month brings forward, without working out the month itself
export function broughtForward(book, sheets, month) {
  const before = (sheets || []).filter((s) => s.month < month);
  const reports = computeBook(book, before);
  if (!reports.length) return openingOf(book);
  return Object.fromEntries(reports[reports.length - 1].currencies.map((c) => [c.code, c.close]));
}

// One line per month for the summary pages (all in the base currency, plus each currency's closing balance)
export const historyRow = (r) => ({
  month: r.month, label: r.label, bf: r.combined.bf, inc: r.combined.inc, exp: r.combined.exp, ex: r.combined.ex,
  close: r.combined.close, closeBy: Object.fromEntries(r.currencies.map((c) => [c.code, c.close])),
});

// Year-to-date totals by category up to and including `month`
export function yearToDate(reports, month) {
  const year = String(month).slice(0, 4);
  const list = reports.filter((r) => r.month.slice(0, 4) === year && r.month <= month);
  const add = (key) => {
    const m = new Map();
    list.forEach((r) => r[key].forEach((x) => m.set(x.name, (m.get(x.name) || 0) + x.amount)));
    return [...m.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  };
  const inc = list.reduce((a, r) => a + r.combined.inc, 0);
  const exp = list.reduce((a, r) => a + r.combined.exp, 0);
  return { year, months: list.length, inc, exp, net: inc - exp, income: add('income'), expense: add('expense') };
}

// Things to fix before a month is sent for review (blocking) and things worth a second look (warnings)
export function checkSheet(book, sheet, report) {
  const problems = [];
  const warnings = [];
  const days = monthDays(sheet.month);
  (sheet.entries || []).forEach((e, i) => {
    const n = `Line ${i + 1}`;
    if (!TYPES.includes(e.type)) problems.push(`${n}: choose Income, Expense or Exchange`);
    if (!(toMinor(e.amount) > 0)) problems.push(`${n}: the amount must be more than 0`);
    if (!e.currency) problems.push(`${n}: choose a currency`);
    if (e.type === 'exchange') {
      if (!e.toCurrency || e.toCurrency === e.currency) problems.push(`${n}: an exchange needs a different currency to change into`);
      if (!(toMinor(e.toAmount) > 0)) problems.push(`${n}: enter the amount received from the exchange`);
    } else if (!String(e.category || '').trim()) problems.push(`${n}: choose a category`);
    if (e.date) {
      const [y, m, d] = String(e.date).split('-');
      if (`${y}-${m}` !== sheet.month || !(Number(d) >= 1 && Number(d) <= days)) warnings.push(`${n}: dated ${e.date}, which is outside ${monthLabel(sheet.month)}`);
    }
  });
  (book.currencies || []).forEach((c) => {
    if (c.code !== book.base && !(rateFor(book, sheet, c.code) > 0)) problems.push(`Enter this month's rate for ${c.code}`);
  });
  if (report) {
    report.currencies.filter((c) => c.close < 0).forEach((c) => warnings.push(`${c.code} closes below zero (${fmtMoney(c.close, c.code)})`));
    if (report.unitemised > 0) warnings.push(`${fmtMoney(report.unitemised, book.base)} of expenses is still "${UNITEMISED}"`);
  }
  if (!(sheet.entries || []).length) warnings.push('This month has no income or expenses yet');
  return { problems, warnings };
}
