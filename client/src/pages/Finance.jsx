import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import api from '../services/api';
import Icon from '../components/ui/Icon';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import { uid } from '../utils/helpers';
import {
  computeSheet, checkSheet, historyRow, fmtNum, fmtMoney, fmtPct, monthLabel, shortMonth, monthAfter, monthDays, toMinor, UNITEMISED,
} from '../utils/financeMath';

// Finance Reports
//   Finance Secretary (and admin): set up the account, write each month, send it to the Secretary, roll back
//   Secretary / President / admin: return a month with comments, or approve and publish it
//   Every member: read published months and download them as PDF
// Each month starts from where the month before ended: brought-forward balances are always worked out, never typed.

const errMsg = (e, fallback = 'Something went wrong. Try again.') => e?.response?.data?.msg || fallback;
const STATUS = {
  draft: { l: 'Draft', cls: '' },
  review: { l: 'With the Secretary', cls: 'warn' },
  returned: { l: 'Returned for changes', cls: 'bad' },
  published: { l: 'Published', cls: 'ok' },
};
const StatusChip = ({ s }) => <span className={`chip sm fin-st ${STATUS[s]?.cls || ''}`}>{STATUS[s]?.l || s}</span>;
const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const thisMonth = () => new Date().toISOString().slice(0, 7);

export const CURRENCY_PRESETS = [
  ['TL', 'Turkish Lira', '₺'], ['USD', 'US Dollar', '$'], ['EUR', 'Euro', '€'], ['GBP', 'British Pound', '£'],
  ['NGN', 'Nigerian Naira', '₦'], ['XAF', 'Central African CFA Franc', 'FCFA'], ['XOF', 'West African CFA Franc', 'CFA'],
  ['CDF', 'Congolese Franc', 'FC'], ['GHS', 'Ghanaian Cedi', '₵'], ['KES', 'Kenyan Shilling', 'KSh'], ['UGX', 'Ugandan Shilling', 'USh'],
  ['TZS', 'Tanzanian Shilling', 'TSh'], ['RWF', 'Rwandan Franc', 'FRw'], ['ZAR', 'South African Rand', 'R'], ['CAD', 'Canadian Dollar', 'C$'],
];
const DEFAULT_BOOK = {
  name: 'AVC Main Account', base: 'TL', startMonth: thisMonth(),
  currencies: [
    { code: 'TL', name: 'Turkish Lira', symbol: '₺', opening: '', rate: 1 },
    { code: 'USD', name: 'US Dollar', symbol: '$', opening: '', rate: '' },
    { code: 'EUR', name: 'Euro', symbol: '€', opening: '', rate: '' },
    { code: 'GBP', name: 'British Pound', symbol: '£', opening: '', rate: '' },
  ],
  incomeCats: ['Weekly Dues', 'Lateness/Absenteeism', 'Sashes', 'Pledges', 'Stem Iron', 'Donations', 'Offerings'],
  expenseCats: ['Birthday', 'Cables', 'Transport', 'Music & Equipment', 'Welfare', UNITEMISED],
  funds: ['General Fund', 'Pledges Fund', 'Stem Iron Fund', 'Birthday Donation', 'To Be Confirmed'],
};

// =====================================================================================================
export default function FinancePage({ ctx }) {
  const { me, toast, setFinanceStatus } = ctx;
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [bookId, setBookId] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [tab, setTab] = useState('months');
  const [newBook, setNewBook] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get('/finance').then(({ data: d }) => {
    setData(d); setFailed(false);
    if (d.status !== undefined) setFinanceStatus?.(d.status);
    setBookId((cur) => (d.books.some((b) => b.id === cur) ? cur : d.books[0]?.id || null));
  }).catch(() => setFailed(true)), [setFinanceStatus]);
  useEffect(() => { load(); }, [load, me?.id]);

  if (failed && !data) return <div className="card"><EmptyState icon="chart" text="The accounts could not be loaded." /><div className="center"><button className="btn btn-soft" onClick={load}>Try again</button></div></div>;
  if (!data) return <div className="card fin-loading"><div className="spinner" /> Loading the accounts…</div>;

  const p = data.perms;
  const insider = p.prepare || p.review;
  const book = data.books.find((b) => b.id === bookId) || null;

  if (openId) {
    return <SheetView id={openId} ctx={ctx} onBack={() => { setOpenId(null); load(); }} onOpen={setOpenId} />;
  }

  const startMonth = async () => {
    setBusy(true);
    try {
      const { data: r } = await api.post(`/finance/books/${book.id}/months`);
      toast(`${monthLabel(r.month)} started — balances carried over`);
      setOpenId(r.id);
    } catch (e) { toast(errMsg(e), 'err'); } finally { setBusy(false); }
  };

  return (
    <div className="stack fin">
      <div className="page-head">
        <div>
          <h2>Finance Reports</h2>
          <p className="muted small">{p.prepare ? 'Write each month, send it to the Secretary, and publish it as a choir document.'
            : p.review ? 'Review the Finance Secretary’s monthly reports, then return them with comments or publish them.'
              : 'The choir’s published monthly accounts. Open a month to read it or download the PDF.'}</p>
        </div>
        {p.prepare && book && !newBook && (
          <button className="btn btn-pri" disabled={busy} onClick={startMonth}>
            <Icon name="plus" size={15} /> Start {monthLabel(book.months.length ? monthAfter(book.months[book.months.length - 1].month) : book.startMonth)}
          </button>
        )}
      </div>

      {(data.books.length > 1 || (p.prepare && data.books.length > 0)) && (
        <div className="chip-row">
          {data.books.map((b) => <button key={b.id} className={`chip ${b.id === bookId && !newBook ? 'on' : ''}`} onClick={() => { setNewBook(false); setBookId(b.id); }}>{b.name}</button>)}
          {p.prepare && <button className={`chip link ${newBook ? 'on' : ''}`} onClick={() => setNewBook(true)}><Icon name="plus" size={13} /> New account</button>}
        </div>
      )}

      {!data.books.length && !p.prepare && (
        <div className="card"><EmptyState icon="chart" text={insider ? 'The Finance Secretary has not set up the accounts yet.' : 'No financial report has been published yet.'} /></div>
      )}

      {p.prepare && (!data.books.length || newBook) && (
        <BookSetup ctx={ctx} first={!data.books.length} onCancel={data.books.length ? () => setNewBook(false) : null}
          onSaved={(b) => { setNewBook(false); setBookId(b.id); setTab('months'); load(); }} />
      )}

      {book && !newBook && (
        <>
          <div className="tab-row">
            {[['months', 'Months'], ['summary', 'Summary'], ...(p.prepare ? [['setup', 'Account set-up']] : []), ...(insider ? [['guide', 'Guide']] : [])].map(([k, l]) => (
              <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          {tab === 'months' && <MonthsList book={book} perms={p} onOpen={setOpenId} onStart={startMonth} busy={busy} />}
          {tab === 'summary' && <SummaryTab book={book} onOpen={setOpenId} />}
          {tab === 'setup' && p.prepare && <BookSetup ctx={ctx} book={book} admin={p.admin} onSaved={() => { load(); toast('Account set-up saved'); }} onDeleted={() => { setBookId(null); load(); }} />}
          {tab === 'guide' && <Guide perms={p} />}
        </>
      )}
    </div>
  );
}

// =====================================================================================================
function MonthsList({ book, perms, onOpen, onStart, busy }) {
  const months = [...book.months].reverse();
  const waiting = months.filter((m) => (perms.review && m.status === 'review') || (perms.prepare && m.status === 'returned'));
  const last = book.months[book.months.length - 1];
  const next = last ? monthAfter(last.month) : book.startMonth;
  return (
    <div className="stack sm-gap">
      {waiting.length > 0 && (
        <div className="fin-wait">
          <Icon name="bell" size={16} />
          <div>
            <b>{waiting.length === 1 ? `${monthLabel(waiting[0].month)} is` : `${waiting.length} months are`} waiting for you</b>
            <div className="small">{perms.review && waiting.some((m) => m.status === 'review') ? 'Read the report, then publish it or return it with comments.' : 'The Secretary returned it with comments. Make the changes and send it again.'}</div>
          </div>
          <button className="btn btn-sm btn-pri" onClick={() => onOpen(waiting[0].id)}>Open</button>
        </div>
      )}
      {perms.prepare && (
        <button className="fin-next" disabled={busy} onClick={onStart}>
          <span className="fin-next-ic"><Icon name="plus" size={18} /></span>
          <span>
            <b>Start {monthLabel(next)}</b>
            <span className="muted small">{last ? `Carries on from ${monthLabel(last.month)}: ${last.closeBy.map((c) => fmtMoney(c.close, c.code)).join(' · ')}` : `First month — starts from the opening balances: ${book.currencies.map((c) => fmtMoney(toMinor(c.opening), c.code)).join(' · ')}`}</span>
          </span>
        </button>
      )}
      {!months.length && <div className="card"><EmptyState icon="calendar" text={perms.prepare ? 'No month yet. Start the first month above.' : 'No month is ready yet.'} /></div>}
      <div className="fin-months">
        {months.map((m) => (
          <button key={m.id} className={`fin-month ${m.status}`} onClick={() => onOpen(m.id)}>
            <div className="fin-month-h"><b>{monthLabel(m.month)}</b><StatusChip s={m.status} /></div>
            <div className="fin-month-bal">
              {m.closeBy.map((c) => <div key={c.code}><span className="muted tiny">{c.code}</span><b className={c.close < 0 ? 'neg' : ''}>{fmtNum(c.close)}</b></div>)}
            </div>
            <div className="fin-month-f tiny">
              <span className="in">In {fmtMoney(m.inc, book.base)}</span>
              <span className="out">Out {fmtMoney(m.exp, book.base)}</span>
              <span className="muted">{m.entryCount} {m.entryCount === 1 ? 'entry' : 'entries'}</span>
            </div>
            {m.status === 'returned' && m.reviewNote && <div className="fin-month-note tiny">“{m.reviewNote}”</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

// =====================================================================================================
function SummaryTab({ book, onOpen }) {
  const months = book.months;
  if (!months.length) return <div className="card"><EmptyState icon="chart" text="The summary appears once a month has figures." /></div>;
  const chart = months.map((m) => ({ name: shortMonth(m.month), Income: m.inc / 100, Expenses: m.exp / 100, Closing: m.close / 100 }));
  const years = [...new Set(months.map((m) => m.month.slice(0, 4)))].reverse();
  const codes = book.currencies.map((c) => c.code);
  const last = months[months.length - 1];
  return (
    <div className="stack">
      <div className="grid g3 fin-kpis">
        <div className="card fin-kpi tot"><span>Latest closing ({book.base} equiv.)</span><b>{fmtMoney(last.close, book.base)}</b><small>{monthLabel(last.month)}</small></div>
        {years.slice(0, 1).map((y) => {
          const list = months.filter((m) => m.month.startsWith(y));
          const inc = list.reduce((a, m) => a + m.inc, 0); const exp = list.reduce((a, m) => a + m.exp, 0);
          return (
            <React.Fragment key={y}>
              <div className="card fin-kpi"><span>Income in {y}</span><b className="in">{fmtMoney(inc, book.base)}</b><small>{list.length} {list.length === 1 ? 'month' : 'months'}</small></div>
              <div className="card fin-kpi"><span>Expenses in {y}</span><b className="out">{fmtMoney(exp, book.base)}</b><small>Net {fmtMoney(inc - exp, book.base)}</small></div>
            </React.Fragment>
          );
        })}
      </div>
      <div className="card">
        <div className="card-h"><h3>Month by month</h3><span className="muted tiny">{book.base} equivalent</span></div>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <ComposedChart data={chart} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="#f0e9da" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#8b7f6a' }} />
              <YAxis tick={{ fontSize: 11, fill: '#8b7f6a' }} tickFormatter={(v) => Number(v).toLocaleString('en-US', { notation: 'compact' })} />
              <Tooltip formatter={(v) => `${book.base} ${Number(v).toLocaleString('en-US')}`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Income" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={34} />
              <Bar dataKey="Expenses" fill="#dc2626" radius={[4, 4, 0, 0]} maxBarSize={34} />
              <Line dataKey="Closing" stroke="#1a2c60" strokeWidth={2.5} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card pad0">
        <div className="fin-scroll">
          <table className="tbl fin-tbl">
            <thead><tr><th>Month</th><th className="r">Brought forward</th><th className="r">Income</th><th className="r">Expenses</th><th className="r">Closing</th>{codes.map((c) => <th key={c} className="r">{c}</th>)}<th /></tr></thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.id}>
                  <td><b>{shortMonth(m.month)}</b></td>
                  <td className="r">{fmtNum(m.bf)}</td><td className="r in">{fmtNum(m.inc)}</td><td className="r out">{fmtNum(m.exp)}</td><td className="r"><b>{fmtNum(m.close)}</b></td>
                  {codes.map((c) => <td key={c} className="r">{fmtNum(m.closeBy.find((x) => x.code === c)?.close || 0)}</td>)}
                  <td className="r"><StatusChip s={m.status} /> <button className="btn btn-sm btn-soft" onClick={() => onOpen(m.id)}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// =====================================================================================================
// One month: write it (Finance Secretary), review it (Secretary), read it (members)
function SheetView({ id, ctx, onBack, onOpen }) {
  const { toast, members, setFinanceStatus } = ctx;
  const [d, setD] = useState(null);
  const [draft, setDraft] = useState(null);
  const [save, setSave] = useState('saved'); // saved | pending | saving | error
  const [tab, setTab] = useState(null);
  const [modal, setModal] = useState(null);
  const rev = useRef(0);
  const timer = useRef(null);
  const queued = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/finance/sheets/${id}`);
      setD(data);
      setDraft({ entries: data.sheet.entries, rates: data.sheet.rates, ratesDate: data.sheet.ratesDate, members: data.sheet.members, notes: data.sheet.notes });
      rev.current = data.sheet.rev;
      setSave('saved');
      setTab((t) => t || (data.perms.prepare && ['draft', 'returned'].includes(data.sheet.status) ? 'entries' : 'report'));
    } catch (e) { toast(errMsg(e, 'That month could not be loaded'), 'err'); onBack(); }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  // Saves go one at a time, each with the number of the copy it changes, so quick edits never trip over each other
  const inflight = useRef(Promise.resolve(true));
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const run = async () => {
      const body = queued.current;
      if (!body) return true;
      queued.current = null;
      setSave('saving');
      try {
        const { data } = await api.put(`/finance/sheets/${id}`, { ...body, rev: rev.current });
        rev.current = data.rev;
        if (!queued.current) setSave('saved');
        return true;
      } catch (e) {
        if (e?.response?.status === 409) { queued.current = null; toast(errMsg(e), 'err'); await load(); return false; }
        queued.current = queued.current || body;
        setSave('error');
        return false;
      }
    };
    inflight.current = inflight.current.then(run, run);
    return inflight.current;
  }, [id, load, toast]);

  useEffect(() => {
    const warn = (e) => { if (queued.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); clearTimeout(timer.current); };
  }, []);

  const change = (patch) => {
    setDraft((cur) => {
      const next = { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) };
      queued.current = next;
      return next;
    });
    setSave('pending');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { flush(); }, 800);
  };

  const book = d?.book;
  const sheet = d ? { ...d.sheet, ...draft } : null;
  const report = useMemo(() => (d && draft ? computeSheet(d.book, { ...d.sheet, ...draft }, d.bf) : null), [d, draft]);
  if (!d || !draft || !report) return <div className="card fin-loading"><div className="spinner" /> Opening the month…</div>;

  const p = d.perms;
  const insider = p.prepare || p.review;
  const editable = p.prepare && ['draft', 'returned'].includes(d.sheet.status);
  const history = d.history.map((h) => (h.month === sheet.month ? historyRow(report) : h));

  const act = async (action, note) => {
    if (!(await flush())) return false;
    try {
      const { data } = await api.post(`/finance/sheets/${id}/action`, { action, note });
      if (data.finance !== undefined) setFinanceStatus?.(data.finance);
      const msg = { submit: 'Sent to the Secretary for review', withdraw: 'Taken back — you can edit it again', return: 'Returned to the Finance Secretary with your comments', publish: 'Published — every member can now read it', reopen: 'Reopened for correction' }[action];
      toast(msg);
      setModal(null);
      setTab(null);
      await load();
      return true;
    } catch (e) {
      if (e?.response?.data?.problems) setModal({ kind: 'submit', problems: e.response.data.problems });
      else toast(errMsg(e), 'err');
      return false;
    }
  };
  // The list of saved copies is read fresh each time: a copy is made by the server while the month is being written
  const openVersions = async () => {
    await flush();
    try { const { data } = await api.get(`/finance/sheets/${id}`); setD((x) => ({ ...x, versions: data.versions })); } catch (e) { /* show what we have */ }
    setModal({ kind: 'versions' });
  };
  const pdf = async () => {
    try {
      const { financePdf } = await import('../utils/financePdf');
      await financePdf({ book, sheet, report, history, ytd: d.ytd });
    } catch (e) { toast('The PDF could not be made', 'err'); }
  };
  const addCategory = async (kind, name) => {
    const key = { income: 'incomeCats', expense: 'expenseCats', fund: 'funds' }[kind];
    if (!name || book[key].includes(name)) return;
    const next = { ...book, [key]: [...book[key], name] };
    setD((x) => ({ ...x, book: next }));
    api.put(`/finance/books/${book.id}`, { [key]: next[key] }).catch(() => {});
  };

  const tabs = [
    ...(editable ? [['entries', 'Write the month']] : []),
    ['report', insider ? 'Report preview' : 'Report'],
    ...(insider ? [['history', 'Review & history']] : []),
  ];

  return (
    <div className="stack fin">
      <div className="fin-top">
        <button className="btn btn-ghost btn-sm" onClick={async () => { await flush(); onBack(); }}><Icon name="back" size={14} /> All months</button>
        <div className="fin-top-t">
          <h2>{monthLabel(sheet.month)}</h2>
          <div className="chip-row"><StatusChip s={d.sheet.status} /><span className="muted tiny">{book.name}</span>{editable && <SaveState s={save} onRetry={flush} />}</div>
        </div>
        <div className="fin-top-a">
          <button className="btn btn-soft btn-sm" onClick={pdf}><Icon name="download" size={14} /> {d.sheet.status === 'published' ? 'Download PDF' : 'Draft PDF'}</button>
          {p.prepare && <button className="btn btn-soft btn-sm" onClick={openVersions}><Icon name="undo" size={14} /> Roll back</button>}
        </div>
      </div>

      {insider && <Flow d={d} perms={p} onAct={(kind) => setModal({ kind })} onAction={act} />}

      {tabs.length > 1 && (
        <div className="tab-row">{tabs.map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      )}

      {tab === 'entries' && editable && (
        <Editor book={book} sheet={sheet} report={report} change={change} members={members} addCategory={addCategory} />
      )}
      {tab === 'report' && <ReportView book={book} sheet={sheet} report={report} history={history} ytd={d.ytd} />}
      {tab === 'history' && insider && <HistoryTab d={d} perms={p} onDelete={() => setModal({ kind: 'delete' })} onOpen={onOpen} />}

      <ActionModals modal={modal} setModal={setModal} d={d} book={book} sheet={sheet} report={report} act={act} flush={flush} reload={load} toast={toast} onBack={onBack} />
    </div>
  );
}

const SaveState = ({ s, onRetry }) => (
  <span className={`fin-save ${s}`}>
    {s === 'saved' && <><Icon name="check" size={12} /> Saved</>}
    {s === 'pending' && 'Editing…'}
    {s === 'saving' && 'Saving…'}
    {s === 'error' && <>Not saved — <button className="link-gold" onClick={onRetry}>retry</button></>}
  </span>
);

// Where the month is: Draft → With the Secretary → Published, and what this person can do next
function Flow({ d, perms, onAct, onAction }) {
  const s = d.sheet.status;
  const steps = [['draft', 'Finance Secretary writes it'], ['review', 'Secretary reviews it'], ['published', 'Published to members']];
  const at = s === 'returned' ? 0 : steps.findIndex(([k]) => k === s);
  return (
    <div className={`card fin-flow ${s}`}>
      <ol className="fin-steps">
        {steps.map(([k, l], i) => <li key={k} className={i < at ? 'done' : i === at ? 'now' : ''}><span>{i < at ? '✓' : i + 1}</span>{l}</li>)}
      </ol>
      {s === 'returned' && d.sheet.reviewNote && (
        <div className="fin-note bad"><b>The Secretary’s comments</b><p>{d.sheet.reviewNote}</p></div>
      )}
      {s === 'review' && <p className="small muted">Sent {when(d.sheet.submittedAt)}. {perms.review ? 'Read the report preview, then publish it or return it with comments.' : 'Waiting for the Secretary.'}</p>}
      {s === 'published' && <p className="small muted">Published {when(d.sheet.publishedAt)} by {d.sheet.publishedByName}. It is in the Documents library under Financial.</p>}
      {d.earlierUnpublished.length > 0 && s !== 'published' && <p className="tiny warn-text">Carries on from {d.earlierUnpublished.map(monthLabel).join(', ')}, which {d.earlierUnpublished.length === 1 ? 'is' : 'are'} not published yet. {d.earlierUnpublished.length === 1 ? 'That month' : 'Those months'} must be published first.</p>}
      <div className="fin-flow-a">
        {perms.prepare && ['draft', 'returned'].includes(s) && <button className="btn btn-pri" onClick={() => onAct('submit')}><Icon name="send" size={14} /> {s === 'returned' ? 'Send again to the Secretary' : 'Send to the Secretary for review'}</button>}
        {perms.prepare && s === 'review' && <button className="btn btn-soft" onClick={() => onAction('withdraw')}>Take back to edit</button>}
        {perms.review && s === 'review' && <>
          <button className="btn btn-pri" onClick={() => onAct('publish')}><Icon name="check" size={14} /> Approve &amp; publish</button>
          <button className="btn btn-soft" onClick={() => onAct('return')}>Return with comments</button>
        </>}
        {(perms.prepare || perms.review) && s === 'published' && <button className="btn btn-soft" onClick={() => onAct('reopen')}><Icon name="undo" size={14} /> Reopen to correct</button>}
      </div>
    </div>
  );
}

// =====================================================================================================
function Editor({ book, sheet, report, change, members, addCategory }) {
  const [entry, setEntry] = useState(null);
  const [filter, setFilter] = useState('all');
  const [addPeople, setAddPeople] = useState(false);
  const rates = book.currencies.filter((c) => c.code !== book.base);
  const list = sheet.entries.map((e, i) => ({ ...e, n: i + 1 }))
    .filter((e) => filter === 'all' || e.type === filter)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || a.n - b.n);
  const today = new Date().toISOString().slice(0, 10);
  const defaultDate = today.startsWith(sheet.month) ? today : `${sheet.month}-01`;
  const blank = (type) => ({ id: uid('fe'), date: defaultDate, type, category: '', fund: '', currency: book.base, amount: '', details: '', toCurrency: '', toAmount: '' });
  const saveEntry = (e) => {
    change((cur) => {
      const exists = cur.entries.some((x) => x.id === e.id);
      return { entries: exists ? cur.entries.map((x) => (x.id === e.id ? e : x)) : [...cur.entries, e] };
    });
    setEntry(null);
  };
  const removeEntry = (eid) => { change((cur) => ({ entries: cur.entries.filter((x) => x.id !== eid) })); setEntry(null); };
  const setMember = (mid, patch) => change((cur) => ({ members: cur.members.map((m) => (m.id === mid ? { ...m, ...patch } : m)) }));
  const rate = (code) => report.byCode[code]?.rate || 0;
  const { problems, warnings } = checkSheet(book, sheet, report);

  return (
    <div className="stack">
      {/* Balances as they stand while typing */}
      <div className="fin-bal">
        {report.currencies.map((c) => (
          <div key={c.code} className="fin-bal-c">
            <span className="muted tiny">{c.code} closing</span>
            <b className={c.close < 0 ? 'neg' : ''}>{fmtNum(c.close)}</b>
            <span className="tiny muted">B/F {fmtNum(c.bf)} · <span className="in">+{fmtNum(c.inc)}</span> · <span className="out">−{fmtNum(c.exp)}</span>{c.ex ? ` · exch ${c.ex > 0 ? '+' : ''}${fmtNum(c.ex)}` : ''}</span>
          </div>
        ))}
        <div className="fin-bal-c tot"><span className="tiny">All together ({book.base})</span><b>{fmtNum(report.combined.close)}</b><span className="tiny">B/F {fmtNum(report.combined.bf)}</span></div>
      </div>

      <div className="card">
        <div className="card-h fin-wrap-h">
          <h3>Income &amp; expenses</h3>
          <div className="chip-row">
            <button className="btn btn-sm fin-btn-in" onClick={() => setEntry(blank('income'))}><Icon name="plus" size={13} /> Income</button>
            <button className="btn btn-sm fin-btn-out" onClick={() => setEntry(blank('expense'))}><Icon name="plus" size={13} /> Expense</button>
            {book.currencies.length > 1 && <button className="btn btn-sm btn-soft" onClick={() => setEntry(blank('exchange'))}><Icon name="plus" size={13} /> Exchange</button>}
          </div>
        </div>
        <div className="chip-row fin-filter">
          {[['all', `All (${sheet.entries.length})`], ['income', 'Income'], ['expense', 'Expenses'], ...(sheet.entries.some((e) => e.type === 'exchange') ? [['exchange', 'Exchanges']] : [])].map(([k, l]) => (
            <button key={k} className={`chip sm ${filter === k ? 'ps-on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        {!list.length && <EmptyState icon="coins" text={sheet.entries.length ? 'Nothing of this kind this month.' : 'No entries yet. Add each income and expense of the month.'} />}
        <div className="fin-entries">
          {list.map((e) => {
            const amt = toMinor(e.amount);
            return (
              <button key={e.id} className={`fin-entry ${e.type}`} onClick={() => setEntry({ ...e })}>
                <span className="fin-e-date tiny muted">{e.date ? new Date(`${e.date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</span>
                <span className={`fin-e-type ${e.type}`}>{e.type === 'income' ? 'In' : e.type === 'expense' ? 'Out' : 'Exch'}</span>
                <span className="fin-e-main">
                  <b>{e.type === 'exchange' ? `${e.currency} → ${e.toCurrency}` : e.category || <i className="warn-text">No category</i>}</b>
                  <span className="tiny muted">{[e.fund, e.details].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="fin-e-amt">
                  <b className={e.type === 'income' ? 'in' : e.type === 'expense' ? 'out' : ''}>{e.type === 'exchange' ? `${fmtMoney(amt, e.currency)} → ${fmtMoney(toMinor(e.toAmount), e.toCurrency)}` : `${e.type === 'expense' ? '−' : '+'}${fmtMoney(amt, e.currency)}`}</b>
                  {e.type !== 'exchange' && e.currency !== book.base && <span className="tiny muted">≈ {fmtMoney(Math.round(amt * rate(e.currency)), book.base)}</span>}
                </span>
              </button>
            );
          })}
        </div>
        {sheet.entries.length > 0 && (
          <div className="fin-entries-tot small">
            <span>Income <b className="in">{fmtMoney(report.combined.inc, book.base)}</b></span>
            <span>Expenses <b className="out">{fmtMoney(report.combined.exp, book.base)}</b></span>
            <span>Net <b>{fmtMoney(report.combined.inc - report.combined.exp, book.base)}</b></span>
          </div>
        )}
      </div>

      <div className="grid g2 fin-g2">
        {rates.length > 0 && (
          <div className="card">
            <div className="card-h"><h3>This month’s rates</h3></div>
            <p className="muted tiny" style={{ marginTop: -8, marginBottom: 6 }}>Used only to add the currencies together in {book.base}. Each currency’s own balance is never changed by a rate.</p>
            {rates.map((c) => (
              <div key={c.code} className="fin-rate">
                <span>1 {c.code} =</span>
                <input className="input sm" inputMode="decimal" value={sheet.rates?.[c.code] ?? ''} onChange={(e) => change((cur) => ({ rates: { ...cur.rates, [c.code]: e.target.value.replace(/[^0-9.]/g, '') } }))} />
                <span>{book.base}</span>
              </div>
            ))}
            <div className="field"><label className="label">Rates checked on</label><input className="input sm" type="date" value={sheet.ratesDate || ''} onChange={(e) => change({ ratesDate: e.target.value })} /></div>
          </div>
        )}
        <div className="card">
          <div className="card-h"><h3>Notes for this month</h3></div>
          <textarea className="input area" rows={6} maxLength={4000} value={sheet.notes} onChange={(e) => change({ notes: e.target.value })} placeholder="Anything the Secretary and members should know — e.g. what an amount was for, money still to be itemised…" />
        </div>
      </div>

      <div className="card">
        <div className="card-h fin-wrap-h">
          <h3>Member dues, lateness &amp; absenteeism ({book.base})</h3>
          <button className="btn btn-sm btn-soft" onClick={() => setAddPeople(true)}><Icon name="plus" size={13} /> Add members</button>
        </div>
        {!sheet.members.length && <EmptyState icon="users" text="No members listed. Add the members who paid or owe this month." />}
        {sheet.members.length > 0 && (
          <div className="fin-mem">
            <div className="fin-mem-r head tiny"><span>Member</span><span>Weekly dues</span><span>Lateness &amp; absenteeism</span><span>Total</span><span /></div>
            {sheet.members.map((m) => (
              <div key={m.id} className="fin-mem-r">
                <span className="fin-mem-n">{m.name}</span>
                <label><small>Dues</small><input className="input sm" inputMode="decimal" value={m.dues ?? ''} onChange={(e) => setMember(m.id, { dues: e.target.value.replace(/[^0-9.]/g, '') })} /></label>
                <label><small>Lateness</small><input className="input sm" inputMode="decimal" value={m.lateness ?? ''} onChange={(e) => setMember(m.id, { lateness: e.target.value.replace(/[^0-9.]/g, '') })} /></label>
                <b className="fin-mem-t">{fmtNum(toMinor(m.dues) + toMinor(m.lateness))}</b>
                <button className="icon-btn" aria-label={`Remove ${m.name}`} onClick={() => change((cur) => ({ members: cur.members.filter((x) => x.id !== m.id) }))}><Icon name="x" size={14} /></button>
              </div>
            ))}
            <div className="fin-mem-r foot"><span>All members</span><b>{fmtNum(report.members.dues)}</b><b>{fmtNum(report.members.lateness)}</b><b className="fin-mem-t">{fmtNum(report.members.total)}</b><span /></div>
          </div>
        )}
      </div>

      {(problems.length > 0 || warnings.length > 0) && (
        <div className="card fin-checks">
          <h3>Checks</h3>
          {problems.map((x) => <div key={x} className="fin-chk bad">✕ {x}</div>)}
          {warnings.map((x) => <div key={x} className="fin-chk warn">! {x}</div>)}
        </div>
      )}

      {entry && <EntryModal entry={entry} book={book} sheet={sheet} onClose={() => setEntry(null)} onSave={saveEntry} onDelete={removeEntry} addCategory={addCategory} isNew={!sheet.entries.some((x) => x.id === entry.id)} />}
      <AddMembers open={addPeople} onClose={() => setAddPeople(false)} members={members} listed={sheet.members}
        onAdd={(rows) => { change((cur) => ({ members: [...cur.members, ...rows] })); setAddPeople(false); }} />
    </div>
  );
}

const NEW = '__new__';
function Pick({ label, value, options, onChange, newLabel }) {
  const [typing, setTyping] = useState(false);
  const all = [...new Set([...options, ...(value ? [value] : [])])];
  if (typing) {
    return (
      <div className="field"><label className="label">{label}</label>
        <div className="fin-pick-new">
          <input className="input" autoFocus value={value} maxLength={60} placeholder={newLabel} onChange={(e) => onChange(e.target.value)} />
          <button className="btn btn-sm btn-ghost" onClick={() => { setTyping(false); onChange(''); }}>Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <div className="field"><label className="label">{label}</label>
      <select className="input" value={value} onChange={(e) => (e.target.value === NEW ? (setTyping(true), onChange('')) : onChange(e.target.value))}>
        <option value="">Choose…</option>
        {all.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value={NEW}>＋ {newLabel}</option>
      </select>
    </div>
  );
}

function EntryModal({ entry, book, sheet, onClose, onSave, onDelete, addCategory, isNew }) {
  const [e, setE] = useState(entry);
  const [err, setErr] = useState('');
  const [sure, setSure] = useState(false);
  const set = (patch) => setE((x) => ({ ...x, ...patch }));
  const used = (type, key) => sheet.entries.filter((x) => x.type === type).map((x) => x[key]).filter(Boolean);
  const cats = e.type === 'income' ? book.incomeCats : book.expenseCats;
  const codes = book.currencies.map((c) => c.code);
  const rateOf = (code) => (code === book.base ? 1 : Number(sheet.rates?.[code]) || 0);
  const amt = toMinor(e.amount);
  const [y, m] = sheet.month.split('-');
  const go = () => {
    if (!(amt > 0)) return setErr('Enter an amount more than 0');
    if (e.type === 'exchange') {
      if (!e.toCurrency || e.toCurrency === e.currency) return setErr('Choose the currency it was changed into');
      if (!(toMinor(e.toAmount) > 0)) return setErr('Enter the amount received');
    } else if (!String(e.category || '').trim()) return setErr('Choose a category');
    const out = { ...e, category: String(e.category || '').trim(), fund: String(e.fund || '').trim(), details: String(e.details || '').trim() };
    if (out.type !== 'exchange') {
      addCategory(out.type, out.category);
      if (out.fund) addCategory('fund', out.fund);
    }
    onSave(out);
  };
  return (
    <Modal open onClose={onClose} title={isNew ? 'Add an entry' : 'Change this entry'}>
      <div className="fin-seg">
        {[['income', 'Income'], ['expense', 'Expense'], ...(codes.length > 1 ? [['exchange', 'Exchange']] : [])].map(([k, l]) => (
          <button key={k} className={`${e.type === k ? `on ${k}` : ''}`} onClick={() => set({ type: k, category: '', ...(k === 'exchange' ? {} : { toCurrency: '', toAmount: '' }) })}>{l}</button>
        ))}
      </div>
      {e.type === 'exchange' && <p className="muted tiny" style={{ marginTop: 8 }}>Money changed from one currency to another. It moves the two balances but is not income or an expense.</p>}
      <div className="grid g2">
        <div className="field"><label className="label">Date</label><input className="input" type="date" min={`${y}-${m}-01`} max={`${y}-${m}-${String(monthDays(sheet.month)).padStart(2, '0')}`} value={e.date || ''} onChange={(x) => set({ date: x.target.value })} /></div>
        <div className="field"><label className="label">{e.type === 'exchange' ? 'Changed from' : 'Currency'}</label>
          <select className="input" value={e.currency} onChange={(x) => set({ currency: x.target.value })}>{codes.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
      </div>
      <div className="field"><label className="label">{e.type === 'exchange' ? `Amount given (${e.currency})` : `Amount (${e.currency})`}</label>
        <input className="input fin-amt" inputMode="decimal" autoFocus={isNew} value={e.amount} placeholder="0" onChange={(x) => set({ amount: x.target.value.replace(/[^0-9.,]/g, '') })} />
        {e.type !== 'exchange' && e.currency !== book.base && amt > 0 && <div className="muted tiny" style={{ marginTop: 4 }}>≈ {fmtMoney(Math.round(amt * rateOf(e.currency)), book.base)} at this month’s rate of {rateOf(e.currency)}</div>}
      </div>
      {e.type === 'exchange' ? (
        <div className="grid g2">
          <div className="field"><label className="label">Changed into</label>
            <select className="input" value={e.toCurrency} onChange={(x) => set({ toCurrency: x.target.value })}><option value="">Choose…</option>{codes.filter((c) => c !== e.currency).map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <div className="field"><label className="label">Amount received{e.toCurrency ? ` (${e.toCurrency})` : ''}</label><input className="input fin-amt" inputMode="decimal" value={e.toAmount} placeholder="0" onChange={(x) => set({ toAmount: x.target.value.replace(/[^0-9.,]/g, '') })} /></div>
          {amt > 0 && toMinor(e.toAmount) > 0 && <div className="muted tiny" style={{ gridColumn: '1/-1' }}>Rate used: 1 {e.currency} = {(toMinor(e.toAmount) / amt).toFixed(4).replace(/\.?0+$/, '')} {e.toCurrency}</div>}
        </div>
      ) : (
        <div className="grid g2">
          <Pick label="Category" value={e.category} options={[...cats, ...used(e.type, 'category')]} onChange={(v) => set({ category: v })} newLabel="New category" />
          <Pick label="Fund" value={e.fund} options={[...book.funds, ...sheet.entries.map((x) => x.fund).filter(Boolean)]} onChange={(v) => set({ fund: v })} newLabel="New fund" />
        </div>
      )}
      <div className="field"><label className="label">Details (optional)</label><input className="input" maxLength={200} value={e.details} onChange={(x) => set({ details: x.target.value })} placeholder="e.g. who paid, what it was for" /></div>
      {err && <div className="err-box">{err}</div>}
      <div className="modal-foot">
        {!isNew && (sure
          ? <button className="btn btn-danger-soft" onClick={() => onDelete(e.id)}>Yes, delete it</button>
          : <button className="btn btn-ghost" onClick={() => setSure(true)}><Icon name="trash" size={14} /> Delete</button>)}
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-pri" onClick={go}>{isNew ? 'Add' : 'Save'}</button>
      </div>
    </Modal>
  );
}

function AddMembers({ open, onClose, members, listed, onAdd }) {
  const [picked, setPicked] = useState([]);
  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { if (open) { setPicked([]); setName(''); setQ(''); } }, [open]);
  const taken = new Set(listed.map((m) => m.memberId).filter(Boolean));
  const takenNames = new Set(listed.map((m) => m.name.toLowerCase()));
  const pool = (members || []).filter((m) => !taken.has(m.id) && !takenNames.has(String(m.name).toLowerCase()))
    .filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const add = () => {
    const rows = (members || []).filter((m) => picked.includes(m.id)).map((m) => ({ id: uid('fm'), memberId: m.id, name: m.name, dues: '', lateness: '' }));
    if (name.trim()) rows.push({ id: uid('fm'), memberId: '', name: name.trim(), dues: '', lateness: '' });
    if (rows.length) onAdd(rows);
  };
  return (
    <Modal open={open} onClose={onClose} title="Add members to this month">
      <input className="input" placeholder="Search the choir list" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="fin-pick-list">
        {pool.length > 0 && <label className="fin-pick-all"><input type="checkbox" checked={pool.length > 0 && pool.every((m) => picked.includes(m.id))} onChange={(e) => setPicked(e.target.checked ? pool.map((m) => m.id) : [])} /> <b>Everyone shown ({pool.length})</b></label>}
        {pool.map((m) => (
          <label key={m.id}><input type="checkbox" checked={picked.includes(m.id)} onChange={(e) => setPicked((x) => (e.target.checked ? [...x, m.id] : x.filter((i) => i !== m.id)))} /> {m.name} <span className="muted tiny">{m.voice || ''}</span></label>
        ))}
        {!pool.length && <p className="muted small">Everyone on the choir list is already in this month.</p>}
      </div>
      <div className="field"><label className="label">Or type a name</label><input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Someone not on the choir list" /></div>
      <div className="modal-foot"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-pri" disabled={!picked.length && !name.trim()} onClick={add}>Add {picked.length + (name.trim() ? 1 : 0) || ''}</button></div>
    </Modal>
  );
}

// =====================================================================================================
// The report itself, as members read it (the PDF follows the same order)
function ReportView({ book, sheet, report, history, ytd }) {
  const base = book.base;
  const c = report.combined;
  const showEx = report.currencies.some((x) => x.ex);
  const codes = report.currencies.map((x) => x.code);
  return (
    <div className="stack fin-report">
      <div className="fin-hero">
        <div>
          <span className="fin-hero-k">ST. BARNABAS AMAZING VOICES CHOIR</span>
          <h3>Financial Report — {monthLabel(sheet.month)}</h3>
          <span className="tiny">{book.name} · each currency in its own money, and all together in {base}</span>
        </div>
        <StatusChip s={sheet.status} />
      </div>

      <div className="fin-cards">
        {report.currencies.map((x) => (
          <div key={x.code} className="fin-card">
            <span>{x.code} closing balance</span>
            <b className={x.close < 0 ? 'neg' : ''}>{fmtMoney(x.close, x.code)}</b>
            <small>B/F {fmtNum(x.bf)} | In {fmtNum(x.inc)} | Out {fmtNum(x.exp)}{x.ex ? ` | Exch ${x.ex > 0 ? '+' : ''}${fmtNum(x.ex)}` : ''}</small>
          </div>
        ))}
        <div className="fin-card tot"><span>All together ({base} equiv.)</span><b>{fmtMoney(c.close, base)}</b><small>B/F {fmtNum(c.bf)} | In {fmtNum(c.inc)} | Out {fmtNum(c.exp)}</small></div>
      </div>

      <div className="card pad0">
        <div className="card-h pad"><h3>Money by currency</h3><span className="muted tiny">each currency in its own money</span></div>
        <div className="fin-scroll">
          <table className="tbl fin-tbl">
            <thead><tr><th>Currency</th><th className="r">Brought forward</th><th className="r">Income</th><th className="r">Expenses</th>{showEx && <th className="r">Exchanged</th>}<th className="r">Closing</th><th className="r">Rate ({base} for 1)</th><th className="r">Closing in {base}</th></tr></thead>
            <tbody>
              {report.currencies.map((x) => (
                <tr key={x.code}>
                  <td><b>{x.name}</b> <span className="muted tiny">{x.code}</span></td>
                  <td className="r">{fmtNum(x.bf)}</td><td className="r in">{fmtNum(x.inc)}</td><td className="r out">{fmtNum(x.exp)}</td>
                  {showEx && <td className="r">{x.ex > 0 ? '+' : ''}{fmtNum(x.ex)}</td>}
                  <td className={`r ${x.close < 0 ? 'out' : ''}`}><b>{fmtNum(x.close)}</b></td><td className="r muted">{x.rate}</td><td className="r">{fmtNum(x.closeBase)}</td>
                </tr>
              ))}
              <tr className="fin-total"><td>All together ({base} equiv.)</td><td className="r">{fmtNum(c.bf)}</td><td className="r">{fmtNum(c.inc)}</td><td className="r">{fmtNum(c.exp)}</td>{showEx && <td className="r">{c.ex > 0 ? '+' : ''}{fmtNum(c.ex)}</td>}<td className="r">{fmtNum(c.close)}</td><td /><td className="r">{fmtNum(c.close)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid g2 fin-g2">
        <Breakdown title="Where the money came from" sub="Income" list={report.income} total={c.inc} base={base} kind="in" />
        <Breakdown title="Where the money was spent" sub="Expenses" list={report.expense} total={c.exp} base={base} kind="out" />
      </div>
      {report.unitemised > 0 && <div className="fin-note warn"><b>Note:</b> {fmtMoney(report.unitemised, base)} (equivalent) of this month’s expenses is still “{UNITEMISED}” by the Finance Secretary.</div>}

      {report.funds.length > 0 && (
        <div className="card pad0">
          <div className="card-h pad"><h3>Funds — movement this month</h3><span className="muted tiny">{base} equivalent</span></div>
          <div className="fin-scroll">
            <table className="tbl fin-tbl">
              <thead><tr><th>Fund</th><th className="r">Income</th><th className="r">Expenses</th><th className="r">Net movement</th></tr></thead>
              <tbody>
                {report.funds.map((f) => <tr key={f.name}><td>{f.name}</td><td className="r in">{fmtNum(f.inc)}</td><td className="r out">{fmtNum(f.exp)}</td><td className={`r ${f.net < 0 ? 'out' : ''}`}><b>{fmtNum(f.net)}</b></td></tr>)}
                <tr className="fin-total"><td>All funds</td><td className="r">{fmtNum(c.inc)}</td><td className="r">{fmtNum(c.exp)}</td><td className="r">{fmtNum(c.inc - c.exp)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {report.members.rows.length > 0 && (
        <div className="card pad0">
          <div className="card-h pad"><h3>Member dues, lateness &amp; absenteeism</h3><span className="muted tiny">{base}</span></div>
          <div className="fin-scroll">
            <table className="tbl fin-tbl">
              <thead><tr><th>Member</th><th className="r">Weekly dues</th><th className="r">Lateness &amp; absenteeism</th><th className="r">Total</th></tr></thead>
              <tbody>
                {report.members.rows.map((m) => <tr key={m.id}><td>{m.name}</td><td className="r">{fmtNum(m.duesMinor)}</td><td className="r">{fmtNum(m.latenessMinor)}</td><td className="r"><b>{fmtNum(m.totalMinor)}</b></td></tr>)}
                <tr className="fin-total"><td>All members — total</td><td className="r">{fmtNum(report.members.dues)}</td><td className="r">{fmtNum(report.members.lateness)}</td><td className="r">{fmtNum(report.members.total)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {history.length > 1 && (
        <div className="card pad0">
          <div className="card-h pad"><h3>Month-by-month summary</h3><span className="muted tiny">{base} equivalent</span></div>
          <div className="fin-scroll">
            <table className="tbl fin-tbl">
              <thead><tr><th>Month</th><th className="r">Brought forward</th><th className="r">Income</th><th className="r">Expenses</th><th className="r">Closing</th>{codes.map((x) => <th key={x} className="r">{x}</th>)}</tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.month} className={h.month === sheet.month ? 'fin-cur' : ''}>
                    <td><b>{shortMonth(h.month)}</b></td><td className="r">{fmtNum(h.bf)}</td><td className="r in">{fmtNum(h.inc)}</td><td className="r out">{fmtNum(h.exp)}</td><td className="r"><b>{fmtNum(h.close)}</b></td>
                    {codes.map((x) => <td key={x} className="r">{fmtNum(h.closeBy[x] || 0)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ytd && ytd.months > 1 && <div className="fin-ytd small">Year to date {ytd.year} ({ytd.months} months): income <b className="in">{fmtMoney(ytd.inc, base)}</b> · expenses <b className="out">{fmtMoney(ytd.exp, base)}</b> · net <b>{fmtMoney(ytd.net, base)}</b></div>}
        </div>
      )}

      {sheet.notes && <div className="card"><div className="card-h"><h3>Notes from the Finance Secretary</h3></div><p className="small fin-pre">{sheet.notes}</p></div>}

      <div className="fin-sign small">
        <div><span className="muted tiny">Prepared by (Finance Secretary)</span><b>{sheet.preparedByName || '—'}</b></div>
        <div><span className="muted tiny">Reviewed &amp; published by</span><b>{sheet.status === 'published' ? `${sheet.publishedByName} · ${day(sheet.publishedAt)}` : 'Not yet approved'}</b></div>
      </div>
    </div>
  );
}

function Breakdown({ title, sub, list, total, base, kind }) {
  return (
    <div className="card">
      <div className="card-h"><h3>{title}</h3><span className="muted tiny">{sub}, {base} equiv.</span></div>
      {!list.length && <p className="muted small">Nothing recorded this month.</p>}
      <div className="fin-bars">
        {list.map((x) => (
          <div key={x.name} className="fin-bar">
            <div className="fin-bar-t"><span>{x.name}</span><b>{fmtNum(x.amount)}</b><span className="muted tiny">{fmtPct(x.pct)}</span></div>
            <div className="fin-bar-track"><i className={kind} style={{ width: `${Math.max(1.5, (x.pct || 0) * 100)}%` }} /></div>
          </div>
        ))}
      </div>
      <div className="fin-bar-tot"><span>Total {sub.toLowerCase()}</span><b className={kind}>{fmtMoney(total, base)}</b></div>
    </div>
  );
}

// =====================================================================================================
const STEP_LABEL = { started: 'Started', submitted: 'Sent to the Secretary', withdrawn: 'Taken back to edit', returned: 'Returned with comments', published: 'Published', reopened: 'Reopened for correction', 'rolled back': 'Rolled back' };
function HistoryTab({ d, perms, onDelete }) {
  const steps = [...(d.sheet.history || [])].reverse();
  return (
    <div className="stack">
      <div className="card">
        <div className="card-h"><h3>What happened</h3></div>
        <ol className="fin-timeline">
          {steps.map((h, i) => (
            <li key={i} className={h.action.replace(' ', '-')}>
              <b>{STEP_LABEL[h.action] || h.action}</b> <span className="muted tiny">{when(h.at)} · {h.byName}</span>
              {h.note && <p className="small">{h.note}</p>}
            </li>
          ))}
        </ol>
      </div>
      {perms.prepare && d.isLatest && d.sheet.status !== 'published' && (
        <div className="card fin-danger">
          <div><b>Delete this month</b><p className="muted tiny">Only the newest month can be deleted, and only while it is not published. Use this if it was started by mistake.</p></div>
          <button className="btn btn-danger-soft btn-sm" onClick={onDelete}><Icon name="trash" size={14} /> Delete {monthLabel(d.sheet.month)}</button>
        </div>
      )}
    </div>
  );
}

function ActionModals({ modal, setModal, d, book, sheet, report, act, flush, reload, toast, onBack }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setNote(''); setBusy(false); }, [modal?.kind]);
  if (!modal) return null;
  const close = () => setModal(null);
  const run = async (fn) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const label = monthLabel(sheet.month);

  if (modal.kind === 'submit') {
    const { problems, warnings } = checkSheet(book, sheet, report);
    const list = modal.problems || problems;
    return (
      <Modal open onClose={close} title={`Send ${label} to the Secretary`}>
        <div className="fin-mini">
          {report.currencies.map((c) => <div key={c.code}><span className="muted tiny">{c.code} closing</span><b>{fmtNum(c.close)}</b></div>)}
          <div><span className="muted tiny">Income ({book.base})</span><b className="in">{fmtNum(report.combined.inc)}</b></div>
          <div><span className="muted tiny">Expenses ({book.base})</span><b className="out">{fmtNum(report.combined.exp)}</b></div>
        </div>
        {list.length > 0 && <div className="fin-checks">{list.map((x) => <div key={x} className="fin-chk bad">✕ {x}</div>)}<p className="small" style={{ marginTop: 6 }}>Fix these first, then send it.</p></div>}
        {!list.length && warnings.length > 0 && <div className="fin-checks">{warnings.map((x) => <div key={x} className="fin-chk warn">! {x}</div>)}<p className="muted tiny">You can still send it.</p></div>}
        {!list.length && <>
          <div className="field"><label className="label">Message to the Secretary (optional)</label><textarea className="input area" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <p className="muted tiny">While it is with the Secretary you cannot change it. You can take it back at any time before it is published.</p>
        </>}
        <div className="modal-foot"><button className="btn btn-ghost" onClick={close}>{list.length ? 'Close' : 'Cancel'}</button>{!list.length && <button className="btn btn-pri" disabled={busy} onClick={() => run(() => act('submit', note))}><Icon name="send" size={14} /> Send for review</button>}</div>
      </Modal>
    );
  }
  if (modal.kind === 'publish') {
    return (
      <Modal open onClose={close} title={`Publish ${label}?`}>
        <p className="small">Every member will be able to read this report and download it as a PDF. It will also be listed in the Documents library under Financial, and members get a notice.</p>
        <div className="fin-mini">
          {report.currencies.map((c) => <div key={c.code}><span className="muted tiny">{c.code} closing</span><b>{fmtNum(c.close)}</b></div>)}
          <div><span className="muted tiny">All together ({book.base})</span><b>{fmtNum(report.combined.close)}</b></div>
        </div>
        <div className="field"><label className="label">Note (optional)</label><input className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Checked against the receipts" /></div>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={close}>Cancel</button><button className="btn btn-pri" disabled={busy} onClick={() => run(() => act('publish', note))}>Publish</button></div>
      </Modal>
    );
  }
  if (modal.kind === 'return' || modal.kind === 'reopen') {
    const ret = modal.kind === 'return';
    return (
      <Modal open onClose={close} title={ret ? `Return ${label} with comments` : `Reopen ${label} to correct it?`}>
        <p className="small">{ret ? 'The Finance Secretary will see your comments and can change the month and send it again.' : 'It goes back to Draft and members stop seeing it until it is published again. The published copy is kept, so it can be rolled back to.'}</p>
        <div className="field"><label className="label">{ret ? 'What needs changing?' : 'Why is it being reopened?'}</label><textarea className="input area" rows={4} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={close}>Cancel</button><button className="btn btn-pri" disabled={busy || !note.trim()} onClick={() => run(() => act(modal.kind, note))}>{ret ? 'Return to the Finance Secretary' : 'Reopen'}</button></div>
      </Modal>
    );
  }
  if (modal.kind === 'versions') {
    const editable = ['draft', 'returned'].includes(d.sheet.status);
    const restore = (v) => run(async () => {
      if (!(await flush())) return;
      try { await api.post(`/finance/sheets/${d.sheet.id}/restore`, { v }); toast(`Rolled back to copy ${v}`); close(); await reload(); } catch (e) { toast(errMsg(e), 'err'); }
    });
    return (
      <Modal open onClose={close} title="Roll back to an earlier copy">
        <p className="small">A copy of the month is kept before each sitting of changes, when it is sent for review and when it is reopened. Rolling back keeps the current copy too, so it can be undone.</p>
        {!editable && <p className="fin-note warn small">{d.sheet.status === 'published' ? 'This month is published. Reopen it first, then roll it back.' : 'This month is with the Secretary. Take it back first, then roll it back.'}</p>}
        {!d.versions.length && <p className="muted small" style={{ marginTop: 10 }}>No earlier copies yet. They appear once the month has been changed.</p>}
        <div className="fin-vers">
          {d.versions.map((v) => (
            <div key={v.v} className="fin-ver">
              <div><b className="small">Copy {v.v} · {v.note}</b><div className="muted tiny">{when(v.at)} · {v.entryCount} {v.entryCount === 1 ? 'entry' : 'entries'}</div></div>
              <button className="btn btn-sm btn-soft" disabled={!editable || busy} onClick={() => restore(v.v)}><Icon name="undo" size={13} /> Restore</button>
            </div>
          ))}
        </div>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={close}>Close</button></div>
      </Modal>
    );
  }
  if (modal.kind === 'delete') {
    return (
      <Modal open onClose={close} title={`Delete ${label}?`}>
        <p className="small">This deletes the month, its {sheet.entries.length} {sheet.entries.length === 1 ? 'entry' : 'entries'} and its saved copies. It cannot be undone. Earlier months are not affected.</p>
        <div className="modal-foot"><button className="btn btn-ghost" onClick={close}>Cancel</button>
          <button className="btn btn-danger-soft" disabled={busy} onClick={() => run(async () => { try { await api.delete(`/finance/sheets/${d.sheet.id}`); toast(`${label} deleted`); onBack(); } catch (e) { toast(errMsg(e), 'err'); } })}>Delete it</button>
        </div>
      </Modal>
    );
  }
  return null;
}

// =====================================================================================================
// Account set-up: currencies, opening balances, categories and funds
function BookSetup({ ctx, book, first, admin, onSaved, onCancel, onDeleted }) {
  const { toast } = ctx;
  const locked = !!book?.months?.some((m) => m.status === 'published');
  const started = !!book?.months?.length;
  const [f, setF] = useState(() => (book ? JSON.parse(JSON.stringify(book)) : JSON.parse(JSON.stringify(DEFAULT_BOOK))));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sure, setSure] = useState(false);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const setCur = (i, patch) => setF((x) => ({ ...x, currencies: x.currencies.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const existing = new Set((book?.currencies || []).map((c) => c.code));
  const used = new Set(f.currencies.map((c) => c.code));
  const addCurrency = (code) => {
    const pre = CURRENCY_PRESETS.find((p) => p[0] === code);
    set({ currencies: [...f.currencies, { code: pre ? pre[0] : '', name: pre ? pre[1] : '', symbol: pre ? pre[2] : '', opening: '', rate: '' }] });
  };
  const save = async () => {
    setErr('');
    if (!f.name.trim()) return setErr('Give the account a name');
    if (f.currencies.some((c) => !String(c.code).trim())) return setErr('Every currency needs a code, e.g. USD');
    if (f.currencies.some((c) => c.code !== f.base && !(Number(c.rate) > 0))) return setErr(`Every other currency needs a rate: how many ${f.base} for 1`);
    setBusy(true);
    try {
      const body = { ...f, currencies: f.currencies.map((c) => ({ ...c, opening: Number(String(c.opening).replace(/,/g, '')) || 0, rate: c.code === f.base ? 1 : Number(c.rate) })) };
      const { data } = book ? await api.put(`/finance/books/${book.id}`, body) : await api.post('/finance/books', body);
      if (!book) toast('Account set up. Start the first month next.');
      onSaved(data.book);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  const remove = async () => {
    try { await api.delete(`/finance/books/${book.id}`); toast('Account deleted'); onDeleted(); } catch (e) { toast(errMsg(e), 'err'); }
  };
  return (
    <div className="card fin-setup">
      <div className="card-h"><h3>{book ? 'Account set-up' : first ? 'Set up the choir account' : 'Set up a new account'}</h3>{onCancel && <button className="btn btn-sm btn-ghost" onClick={onCancel}>Cancel</button>}</div>
      {!book && <p className="small muted" style={{ marginTop: -6 }}>Do this once. Choose the currencies the choir keeps, and what each one held at the start of the first month. Every month after that carries on by itself.</p>}
      {locked && <p className="fin-note small">A month has been published, so the main currency, first month and opening balances are fixed. To correct an opening balance, record the difference as income or an expense.</p>}
      <div className="grid g3 fin-g3">
        <div className="field"><label className="label">Account name</label><input className="input" value={f.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} /></div>
        <div className="field"><label className="label">Main currency (totals shown in)</label>
          <select className="input" value={f.base} disabled={locked || started} onChange={(e) => setF((x) => ({ ...x, base: e.target.value, currencies: x.currencies.map((c) => (c.code === e.target.value ? { ...c, rate: 1 } : c)) }))}>
            {f.currencies.filter((c) => c.code).map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
          </select>
        </div>
        <div className="field"><label className="label">First month of records</label><input className="input" type="month" value={f.startMonth} disabled={locked} onChange={(e) => set({ startMonth: e.target.value })} /></div>
      </div>

      <h4 className="fin-sub">Currencies</h4>
      <div className="fin-curs">
        <div className="fin-cur head tiny"><span>Code</span><span>Name</span><span>Sign</span><span>Balance at the start of {monthLabel(f.startMonth) || 'the first month'}</span><span>Rate ({f.base} for 1)</span><span /></div>
        {f.currencies.map((c, i) => {
          const isBase = c.code === f.base;
          const old = existing.has(c.code);
          return (
            <div key={i} className={`fin-cur ${isBase ? 'base' : ''}`}>
              <label><small>Code</small><input className="input sm" value={c.code} maxLength={8} disabled={old} onChange={(e) => setCur(i, { code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} /></label>
              <label><small>Name</small><input className="input sm" value={c.name} maxLength={40} onChange={(e) => setCur(i, { name: e.target.value })} /></label>
              <label><small>Sign</small><input className="input sm" value={c.symbol} maxLength={4} onChange={(e) => setCur(i, { symbol: e.target.value })} /></label>
              <label><small>Opening balance</small><input className="input sm" inputMode="decimal" value={c.opening} disabled={locked && old} placeholder="0" onChange={(e) => setCur(i, { opening: e.target.value.replace(/[^0-9.,-]/g, '') })} /></label>
              <label><small>Rate</small>{isBase ? <span className="fin-base-tag">Main · 1</span> : <input className="input sm" inputMode="decimal" value={c.rate} placeholder={`${f.base} for 1`} onChange={(e) => setCur(i, { rate: e.target.value.replace(/[^0-9.]/g, '') })} />}</label>
              {!isBase ? <button className="icon-btn" aria-label={`Remove ${c.code}`} onClick={() => set({ currencies: f.currencies.filter((_, j) => j !== i) })}><Icon name="x" size={14} /></button> : <span />}
            </div>
          );
        })}
      </div>
      <div className="chip-row" style={{ marginTop: 10 }}>
        <select className="input sm" value="" onChange={(e) => e.target.value && addCurrency(e.target.value === NEW ? '' : e.target.value)}>
          <option value="">＋ Add a currency…</option>
          {CURRENCY_PRESETS.filter((p) => !used.has(p[0])).map((p) => <option key={p[0]} value={p[0]}>{p[0]} — {p[1]}</option>)}
          <option value={NEW}>Another currency (type its code)</option>
        </select>
        <span className="muted tiny">A currency added later starts at 0. Record any money it already holds as income.</span>
      </div>

      <div className="grid g3 fin-g3" style={{ marginTop: 6 }}>
        <ListEdit label="Income categories" value={f.incomeCats} onChange={(v) => set({ incomeCats: v })} />
        <ListEdit label="Expense categories" value={f.expenseCats} onChange={(v) => set({ expenseCats: v })} />
        <ListEdit label="Funds" value={f.funds} onChange={(v) => set({ funds: v })} />
      </div>
      <p className="muted tiny">Categories and funds can also be added while writing a month. Removing one here does not change entries already recorded.</p>
      {err && <div className="err-box">{err}</div>}
      <div className="modal-foot">
        {book && admin && !locked && (sure
          ? <button className="btn btn-danger-soft" onClick={remove}>Yes, delete the account and its {book.months.length} unpublished {book.months.length === 1 ? 'month' : 'months'}</button>
          : <button className="btn btn-ghost" onClick={() => setSure(true)}><Icon name="trash" size={14} /> Delete account</button>)}
        <span style={{ flex: 1 }} />
        <button className="btn btn-pri" disabled={busy} onClick={save}>{busy ? 'Saving…' : book ? 'Save set-up' : 'Set up the account'}</button>
      </div>
    </div>
  );
}

function ListEdit({ label, value, onChange }) {
  const [t, setT] = useState('');
  const add = () => { const v = t.trim(); if (v && !value.includes(v)) onChange([...value, v]); setT(''); };
  return (
    <div className="field">
      <label className="label">{label}</label>
      <div className="fin-tags">
        {value.map((v) => <span key={v} className="fin-tag">{v}<button aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}><Icon name="x" size={11} /></button></span>)}
      </div>
      <div className="fin-pick-new"><input className="input sm" value={t} maxLength={60} placeholder="Add…" onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} /><button className="btn btn-sm btn-soft" onClick={add}>Add</button></div>
    </div>
  );
}

// =====================================================================================================
function Guide({ perms }) {
  return (
    <div className="grid g2 fin-g2">
      {perms.prepare && (
        <div className="card fin-guide">
          <h3>Finance Secretary: each month</h3>
          <ol>
            <li><b>Start the month.</b> Press <i>Start (month)</i>. Its brought-forward balances are the closing balances of the month before, worked out for you. The rates and member list are copied from last month.</li>
            <li><b>Add each income and expense.</b> Choose the type, category, fund and currency; type the amount in that currency. Use <i>Exchange</i> when money is changed from one currency to another.</li>
            <li><b>Update the rates</b> if they changed. They are only used to add the currencies together.</li>
            <li><b>Fill in members’ dues and lateness.</b> Press <i>Add members</i> to pick from the choir list.</li>
            <li><b>Check the Report preview</b> — it is exactly what members and the PDF will show. Fix anything in <i>Checks</i>.</li>
            <li><b>Send to the Secretary.</b> If it comes back with comments, change it and send it again.</li>
          </ol>
          <h4 className="fin-sub">Rolling back</h4>
          <ul>
            <li><b>Roll back</b> restores an earlier copy of the month. A copy is kept before every sitting of changes, so a mistake can always be undone.</li>
            <li>A <b>published</b> month can be <b>reopened</b> to correct it (the newest published month first). The published copy is kept.</li>
            <li>A month started by mistake can be <b>deleted</b> if it is the newest and not published.</li>
            <li>Correcting an earlier month carries through on its own: later months always start from where it ends.</li>
          </ul>
        </div>
      )}
      {perms.review && (
        <div className="card fin-guide">
          <h3>Secretary: reviewing</h3>
          <ol>
            <li>When a month is sent to you, it shows a number on <i>Finance Reports</i> in the menu.</li>
            <li>Open it and read the <b>Report preview</b>. Download the draft PDF if you want to check it on paper.</li>
            <li><b>Return with comments</b> if something needs changing — say what. The Finance Secretary sees your comments.</li>
            <li><b>Approve &amp; publish</b> when it is right. Members are told, and it appears in Documents under Financial with a PDF download.</li>
            <li>Months are published in order, because each one carries on from the month before.</li>
            <li>Found a mistake after publishing? <b>Reopen to correct</b> sends it back to Draft.</li>
          </ol>
        </div>
      )}
      <div className="card fin-guide">
        <h3>How the figures work</h3>
        <ul>
          <li><b>Each currency is kept in its own money.</b> Closing = brought forward + income − expenses (± exchanges).</li>
          <li><b>All together</b> adds the currencies using this month’s rates, in the main currency.</li>
          <li>Amounts are worked to the cent, so totals always add up exactly.</li>
          <li>Old Members cannot see the accounts.</li>
        </ul>
      </div>
    </div>
  );
}
