import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Icon from '../components/ui/Icon';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import { describe, yearCalendar, SEASONS, VESTMENT } from '../utils/liturgical';
import { parseCsv, downloadCsv, readDate } from '../utils/csv';

const RANKS = ['Sunday', 'Solemnity', 'Feast', 'Ash Wednesday', 'Triduum', 'Commemoration', 'Weekday', 'Event'];
const MAX_PSALMISTS = 4;
const thisYear = new Date().getFullYear();
const local = (d) => new Date(`${d}T00:00:00`);
const fmt = (d, o) => local(d).toLocaleDateString('en-GB', o);
const monthOf = (d) => fmt(d, { month: 'long', year: 'numeric' });
const longDate = (d) => fmt(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const todayStr = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };
const colorOf = (d) => VESTMENT[d.color] || '#64748b';
const blank = { date: '', title: '', rank: 'Weekday', season: 'Ordinary Time', color: 'green', cycle: '', note: '', psalmistIds: [] };
const CSV_HEAD = ['Date', 'Title', 'Type', 'Season', 'Cycle', 'Psalmists', 'Note', 'Status'];
// Column names people might use in their spreadsheet
const COLUMNS = { date: ['date', 'day'], title: ['title', 'celebration', 'feast', 'occasion'], rank: ['type', 'rank'], season: ['season'], cycle: ['cycle', 'year'], psalmists: ['psalmists', 'psalmist', 'psalmist(s)'], note: ['note', 'notes', 'psalm'] };
const MAX_WARN = 8;

// Turns spreadsheet rows into roster rows: missing titles, types and seasons come from the Catholic calendar,
// psalmist names are matched to members, and anything unreadable becomes a warning instead of an error
function readRoster(table, members) {
  const head = table[0].map((h) => h.toLowerCase().replace(/\s+/g, ' ').trim());
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([k, names]) => [k, head.findIndex((h) => names.includes(h))]));
  if (col.date < 0) return { rows: [], warnings: ['The file needs a "Date" column. Download the template to see the layout.'] };
  const byName = (n) => {
    const q = n.toLowerCase().replace(/\s+/g, ' ').trim();
    const exact = members.filter((m) => m.name.toLowerCase() === q);
    if (exact.length === 1) return exact[0];
    const loose = members.filter((m) => m.name.toLowerCase().startsWith(q) || m.name.toLowerCase().split(' ').includes(q));
    return loose.length === 1 ? loose[0] : null;
  };
  const rows = []; const warnings = [];
  table.slice(1).forEach((r, i) => {
    const get = (k) => (col[k] >= 0 ? (r[col[k]] || '').trim() : '');
    const line = i + 2;
    const date = readDate(get('date'));
    if (!date) { warnings.push(`Row ${line}: "${get('date') || '(empty)'}" isn't a date — skipped`); return; }
    const cal = describe(date);
    const title = get('title') || cal.title;
    const rank = RANKS.find((x) => x.toLowerCase() === get('rank').toLowerCase()) || (title === cal.title ? cal.rank : 'Event');
    const season = SEASONS.find((x) => x.toLowerCase() === get('season').toLowerCase()) || cal.season;
    let psalmistIds = null;
    const names = get('psalmists').split(/[;/&\n]|\band\b/i).map((s) => s.trim()).filter(Boolean);
    if (names.length) {
      const found = names.map((n) => [n, byName(n)]);
      found.filter(([, m]) => !m).forEach(([n]) => warnings.push(`Row ${line}: no member called "${n}"`));
      const ids = [...new Set(found.filter(([, m]) => m).map(([, m]) => m.id))].slice(0, MAX_PSALMISTS);
      if (ids.length) psalmistIds = ids;
    }
    rows.push({ date, title, rank, season, color: cal.color, cycle: get('cycle') || cal.cycle, note: get('note'), psalmistIds });
  });
  return { rows, warnings };
}

// Builds and downloads the Psalmist List as a PDF (the PDF library loads only when needed)
async function downloadPdf(days, { year, label }) {
  const [{ jsPDF }, table] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  // The table plugin is published as CommonJS, so its function may be one `default` deeper
  const autoTable = [table.default, table.default?.default].find((f) => typeof f === 'function');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(26, 44, 96); doc.rect(0, 0, W, 78, 'F');
  doc.setTextColor(233, 166, 58); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('ST. BARNABAS AMAZING VOICES CHOIR', 40, 30);
  doc.setTextColor(255, 255, 255); doc.setFontSize(19);
  doc.text(`Responsorial Psalmist List ${year}`, 40, 55);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(198, 205, 228);
  doc.text(label, 40, 70);
  autoTable(doc, {
    startY: 96,
    head: [['Date', 'Celebration', 'Season', 'Psalmist(s)']],
    body: days.map((d) => [fmt(d.date, { weekday: 'short', day: 'numeric', month: 'short' }), d.title + (d.note ? `\n${d.note}` : ''), [d.season, d.cycle].filter(Boolean).join('\n'), d.psalmists.map((p) => p.name).join('\n') || '—']),
    styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 6, lineColor: [227, 216, 194], lineWidth: 0.5, textColor: [34, 34, 34], valign: 'middle' },
    headStyles: { fillColor: [233, 166, 58], textColor: [26, 44, 96], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 247, 240] },
    columnStyles: { 0: { cellWidth: 78, fontStyle: 'bold' }, 2: { cellWidth: 92, textColor: [110, 110, 110] }, 3: { cellWidth: 120 } },
    didParseCell: (c) => {
      if (c.section === 'body' && c.column.index === 1 && ['Solemnity', 'Triduum'].includes(days[c.row.index].rank)) c.cell.styles.fontStyle = 'bold';
    },
    didDrawPage: () => {
      const H = doc.internal.pageSize.getHeight();
      doc.setFontSize(8); doc.setTextColor(150, 150, 150);
      doc.text(`Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · AVC Cloud`, 40, H - 20);
      doc.text(`Page ${doc.internal.getNumberOfPages()}`, W - 40, H - 20, { align: 'right' });
    },
    margin: { left: 40, right: 40, bottom: 40 },
  });
  doc.save(`Psalmist-List-${year}.pdf`);
}

export default function PsalmistsPage({ ctx }) {
  const { me, toast } = ctx;
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [season, setSeason] = useState('All');
  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('all');
  const [mineOnly, setMineOnly] = useState(false);
  const [picked, setPicked] = useState(new Set());
  const [edit, setEdit] = useState(null);
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [csv, setCsv] = useState(null); // { name, rows, warnings, summary }

  const load = () => api.get('/psalmists', { params: { year } }).then(({ data: d }) => { setData(d); setFailed(false); }).catch(() => setFailed(true));
  useEffect(() => { setData(null); setPicked(new Set()); load(); }, [year]);

  const planner = !!data?.canPlan;
  const days = data?.days || [];
  const shown = useMemo(() => days.filter((d) => (season === 'All' || d.season === season)
    && (kind === 'all' || (kind === 'weekdays' ? d.rank === 'Weekday' : d.rank !== 'Weekday'))
    && (status === 'all' || (status === 'published' ? d.published : !d.published))
    && (!mineOnly || d.psalmists.some((p) => p.id === me.id))), [days, season, kind, status, mineOnly, me.id]);
  const months = useMemo(() => shown.reduce((acc, d) => { const m = monthOf(d.date); (acc[m] ||= []).push(d); return acc; }, {}), [shown]);
  const today = todayStr();
  const mine = days.filter((d) => d.published && d.date >= today && d.psalmists.some((p) => p.id === me.id)).slice(0, 3);
  const counts = { total: days.length, published: days.filter((d) => d.published).length, unassigned: days.filter((d) => !d.psalmists.length).length };

  const run = async (fn, done) => {
    setBusy(true);
    try { await fn(); if (done) toast(done); await load(); return true; } catch (e) { toast(e.response?.data?.msg || 'That did not work — please try again', 'err'); return false; } finally { setBusy(false); }
  };
  const generate = () => run(async () => {
    const { data: r } = await api.post('/psalmists/batch', { days: yearCalendar(year) });
    toast(r.added ? `Added ${r.added} Sundays and celebrations for ${year}` : `The ${year} calendar is already complete`);
  });
  const publish = (published) => run(() => api.post('/psalmists/publish', { ids: [...picked], published }), `${picked.size} day${picked.size === 1 ? '' : 's'} ${published ? 'published — members can now see them' : 'hidden from members'}`).then((ok) => ok && setPicked(new Set()));
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pickAllShown = () => setPicked((s) => (shown.every((d) => s.has(d.id)) ? new Set() : new Set(shown.map((d) => d.id))));

  const openNew = () => { setWho(''); setConfirmDelete(false); setEdit({ ...blank, date: year === thisYear ? today : `${year}-01-01`, ...describe(year === thisYear ? today : `${year}-01-01`), auto: true }); };
  const openEdit = (d) => { setWho(''); setConfirmDelete(false); setEdit({ ...d, psalmistIds: d.psalmists.map((p) => p.id), auto: false }); };
  const setDate = (date) => setEdit((e) => (e.auto && date ? { ...e, ...describe(date), date } : { ...e, date }));
  const useCalendar = () => setEdit((e) => ({ ...e, ...describe(e.date), date: e.date, auto: true }));
  const togglePsalmist = (id) => setEdit((e) => {
    const has = e.psalmistIds.includes(id);
    if (!has && e.psalmistIds.length >= MAX_PSALMISTS) { toast(`Up to ${MAX_PSALMISTS} psalmists per day`, 'err'); return e; }
    return { ...e, psalmistIds: has ? e.psalmistIds.filter((x) => x !== id) : [...e.psalmistIds, id] };
  });
  const save = () => {
    if (!edit.date) return toast('Choose a date', 'err');
    if (!edit.title.trim()) return toast('Enter a title for the day', 'err');
    const body = { date: edit.date, title: edit.title, rank: edit.rank, season: edit.season, color: edit.color, cycle: edit.cycle, note: edit.note, psalmistIds: edit.psalmistIds };
    return run(() => (edit.id ? api.patch(`/psalmists/${edit.id}`, body) : api.post('/psalmists', body)), edit.id ? 'Day updated' : 'Day added').then((ok) => {
      if (ok) { setEdit(null); if (+edit.date.slice(0, 4) !== year) setYear(+edit.date.slice(0, 4)); }
    });
  };
  const remove = () => run(() => api.delete(`/psalmists/${edit.id}`), 'Day removed').then((ok) => ok && setEdit(null));
  const exportCsv = () => downloadCsv(`Psalmist-List-${year}.csv`, [CSV_HEAD, ...days.map((d) => [d.date, d.title, d.rank, d.season, d.cycle, d.psalmists.map((p) => p.name).join('; '), d.note, d.published ? 'Published' : 'Draft'])]);
  const templateCsv = () => downloadCsv(`Psalmist-Template-${year}.csv`, [CSV_HEAD, ...yearCalendar(year).map((d) => [d.date, d.title, d.rank, d.season, d.cycle, '', '', ''])]);
  const readFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast('That file is too large for a calendar (over 2 MB)', 'err');
    const table = parseCsv(await file.text());
    if (table.length < 2) return toast('The file is empty or has only a header row', 'err');
    const { rows, warnings } = readRoster(table, data.members);
    if (!rows.length) return setCsv({ name: file.name, rows, warnings, summary: null });
    setBusy(true);
    try {
      const { data: summary } = await api.post('/psalmists/import', { rows, dryRun: true });
      setCsv({ name: file.name, rows, warnings, summary });
    } catch (err) { toast(err.response?.data?.msg || 'The file could not be checked', 'err'); } finally { setBusy(false); }
  };
  const applyCsv = () => run(async () => {
    const { data: r } = await api.post('/psalmists/import', { rows: csv.rows, dryRun: false });
    toast(`Imported: ${r.added} new, ${r.updated} updated${r.unchanged ? `, ${r.unchanged} already up to date` : ''}`);
    const years = [...new Set(csv.rows.map((x) => +x.date.slice(0, 4)))];
    setCsv(null);
    if (years.length === 1 && years[0] !== year) setYear(years[0]);
  });
  const pdf = async () => {
    const list = planner && picked.size ? shown.filter((d) => picked.has(d.id)) : shown;
    if (!list.length) return toast('Nothing to put in the PDF — change the filters', 'err');
    setBusy(true);
    try {
      const label = [season === 'All' ? 'All seasons' : season, kind === 'weekdays' ? 'weekdays' : kind === 'sundays' ? 'Sundays & celebrations' : null,
        planner && list.some((d) => !d.published) ? 'includes unpublished days' : null].filter(Boolean).join(' · ');
      await downloadPdf(list, { year, label: `${label} · ${list.length} day${list.length === 1 ? '' : 's'}` });
    } catch { toast('Could not make the PDF — please try again', 'err'); } finally { setBusy(false); }
  };

  const head = (
    <div className="page-head">
      <div><h2>Psalmist List</h2><p className="muted small">{planner ? 'Plan the responsorial psalmists on the Catholic calendar. Members only see the days you publish.' : 'Who leads the responsorial psalm, by Sunday and celebration.'}</p></div>
      <div className="head-actions">
        <select className="input sm" aria-label="Year" value={year} onChange={(e) => setYear(+e.target.value)}>
          {[thisYear - 1, thisYear, thisYear + 1, thisYear + 2].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {planner && <button className="btn btn-soft" disabled={busy} onClick={openNew}><Icon name="plus" size={14} /> Add day</button>}
        {planner && <button className="btn btn-soft" disabled={busy} onClick={() => setCsv({})}><Icon name="upload" size={14} /> CSV</button>}
        <button className="btn btn-pri" disabled={busy || !days.length} onClick={pdf}><Icon name="file" size={14} /> {planner && picked.size ? `PDF (${picked.size})` : 'Download PDF'}</button>
      </div>
    </div>
  );
  if (failed) return <div className="stack">{head}<div className="card"><p className="small" style={{ margin: 0 }}>The psalmist list could not be loaded. <button className="btn btn-sm btn-soft" onClick={load}>Try again</button></p></div></div>;
  if (!data) return <div className="stack">{head}<p className="muted small">Loading…</p></div>;

  return (
    <div className="stack">
      {head}

      {mine.length > 0 && (
        <div className="card ps-mine">
          <div className="card-h"><h3>🎤 Your next psalms</h3></div>
          {mine.map((d) => <div key={d.id} className="ps-mine-row"><b>{longDate(d.date)}</b><span className="muted small">{d.title}</span></div>)}
          <p className="muted tiny" style={{ marginBottom: 0 }}>You'll get a reminder two weeks and one week before each date.</p>
        </div>
      )}

      {planner && (
        <div className="grid g4 stat-grid ps-stats">
          <div className="card ps-stat"><b>{counts.total}</b><span>days planned</span></div>
          <div className="card ps-stat"><b>{counts.published}</b><span>published</span></div>
          <div className="card ps-stat"><b>{counts.total - counts.published}</b><span>drafts</span></div>
          <div className="card ps-stat"><b style={counts.unassigned ? { color: '#d97706' } : undefined}>{counts.unassigned}</b><span>without a psalmist</span></div>
        </div>
      )}

      {planner && (
        <div className="card ps-gen">
          <div><b className="small">Catholic calendar {year}</b><div className="muted tiny">Adds every Sunday, solemnity and main feast with its liturgical title, season and Year {year % 3 === 1 ? 'A' : year % 3 === 2 ? 'B' : 'C'}/{year % 2 ? 'I' : 'II'} cycle. Days already planned are kept.</div></div>
          <button className="btn btn-sm btn-soft" disabled={busy} onClick={generate}><Icon name="calendar" size={13} /> {days.length ? 'Add missing days' : `Generate ${year}`}</button>
        </div>
      )}

      <div className="ps-filters">
        <div className="chip-row">{['All', ...SEASONS].map((s) => <button key={s} className={`chip sm ${season === s ? 'ps-on' : ''}`} onClick={() => setSeason(s)}>{s}</button>)}</div>
        <div className="chip-row">
          <select className="input sm" aria-label="Type of day" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">Sundays, celebrations & weekdays</option><option value="sundays">Sundays & celebrations</option><option value="weekdays">Weekdays</option>
          </select>
          {planner && (
            <select className="input sm" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Published & drafts</option><option value="published">Published</option><option value="draft">Drafts</option>
            </select>
          )}
          <label className="ps-check small"><input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> Only mine</label>
        </div>
      </div>

      {planner && shown.length > 0 && (
        <div className={`ps-bulk ${picked.size ? 'on' : ''}`}>
          <label className="ps-check small"><input type="checkbox" checked={shown.every((d) => picked.has(d.id))} onChange={pickAllShown} /> {picked.size ? `${picked.size} selected` : 'Select all shown'}</label>
          {picked.size > 0 && (<div className="chip-row">
            <button className="btn btn-sm btn-pri" disabled={busy} onClick={() => publish(true)}>Publish</button>
            <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => publish(false)}>Unpublish</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setPicked(new Set())}>Clear</button>
          </div>)}
        </div>
      )}

      {!days.length && (planner
        ? <EmptyState icon="calendar" text={`Nothing planned for ${year} yet. Generate the Catholic calendar above to start.`} />
        : <EmptyState icon="calendar" text={`The psalmist list for ${year} hasn't been published yet.`} />)}
      {days.length > 0 && !shown.length && <EmptyState icon="calendar" text="No days match these filters." />}

      {Object.entries(months).map(([month, list]) => (
        <div className="card pad0 ps-month" key={month}>
          <div className="ps-month-h">{month}</div>
          {list.map((d) => {
            const mineDay = d.psalmists.some((p) => p.id === me.id);
            const past = d.date < today;
            return (
              <div className={`ps-row ${mineDay ? 'mine' : ''} ${past ? 'past' : ''}`} key={d.id}>
                {planner && <input type="checkbox" className="ps-pick" aria-label={`Select ${d.title}`} checked={picked.has(d.id)} onChange={() => toggle(d.id)} />}
                <div className="ps-date" style={{ borderColor: colorOf(d) }}>
                  <span>{fmt(d.date, { weekday: 'short' })}</span><b>{local(d.date).getDate()}</b><span>{fmt(d.date, { month: 'short' })}</span>
                </div>
                <div className="ps-main">
                  <div className="ps-title">{d.title}</div>
                  <div className="muted tiny"><span className="ps-dot" style={{ background: colorOf(d) }} />{[d.season, d.cycle, d.rank !== 'Sunday' && d.rank !== 'Weekday' ? d.rank : null].filter(Boolean).join(' · ')}</div>
                  {d.note && <div className="muted tiny ps-note">{d.note}</div>}
                </div>
                <div className="ps-who">
                  {d.psalmists.length ? d.psalmists.map((p) => <span key={p.id} className={`chip sm ${p.id === me.id ? 'ps-me' : ''}`}>{p.name}</span>) : <span className="muted tiny">{planner ? 'No psalmist yet' : '—'}</span>}
                </div>
                {planner && (
                  <div className="ps-act">
                    <span className="act-tag" style={d.published ? { background: '#0596691a', color: '#059669' } : { background: '#64748b1a', color: '#64748b' }}>{d.published ? 'Published' : 'Draft'}</span>
                    <button className="btn btn-sm btn-soft" onClick={() => openEdit(d)}><Icon name="edit" size={12} /> {d.psalmists.length ? 'Edit' : 'Assign'}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <Modal open={!!csv} wide onClose={() => setCsv(null)} title={csv?.name ? 'Check the import' : 'Import or export with a spreadsheet'}>
        {csv && !csv.name && (<>
          <p className="small" style={{ marginTop: 0 }}>Plan the year in Excel or Google Sheets, then upload it here. Save the sheet as <b>CSV</b> with these columns:</p>
          <div className="csv-cols">{CSV_HEAD.slice(0, 7).map((c) => <span key={c} className="chip sm">{c}</span>)}</div>
          <ul className="csv-help muted small">
            <li><b>Date</b> is the only column you must fill — e.g. 2026-11-22 or 22/11/2026. Blank titles, types and seasons come from the Catholic calendar.</li>
            <li><b>Psalmists</b>: members' names separated by semicolons, e.g. <i>Grace Okafor; Tobi Adeyemi</i>.</li>
            <li>A row whose date (and title) is already on the list updates that day; blank cells leave it as it is. Other rows are added as drafts.</li>
            <li>Nothing is published by the import — publish the days you're happy with afterwards.</li>
          </ul>
          <div className="chip-row" style={{ marginBottom: 12 }}>
            <button className="btn btn-sm btn-soft" onClick={templateCsv}><Icon name="file" size={13} /> Template for {year}</button>
            <button className="btn btn-sm btn-soft" disabled={!days.length} onClick={exportCsv}><Icon name="file" size={13} /> Export current list</button>
          </div>
          <label className="upload-drop">
            <Icon name="upload" size={22} />
            <div><b className="small">{busy ? 'Checking the file…' : 'Choose a CSV file'}</b><div className="muted tiny">Up to 1,000 rows. You'll see what will change before anything is saved.</div></div>
            <input type="file" hidden accept=".csv,text/csv" onChange={readFile} />
          </label>
        </>)}
        {csv?.name && (<>
          <p className="small" style={{ marginTop: 0 }}><b>{csv.name}</b> — {csv.rows.length} row{csv.rows.length === 1 ? '' : 's'} read.</p>
          {csv.summary && (
            <div className="csv-sum">
              <div><b>{csv.summary.added}</b><span>new days</span></div>
              <div><b>{csv.summary.updated}</b><span>updated</span></div>
              <div><b>{csv.summary.unchanged}</b><span>unchanged</span></div>
            </div>
          )}
          {csv.warnings.length > 0 && (
            <div className="csv-warn small">
              <b>{csv.warnings.length} thing{csv.warnings.length === 1 ? '' : 's'} to check</b>
              <ul>{csv.warnings.slice(0, MAX_WARN).map((w) => <li key={w}>{w}</li>)}{csv.warnings.length > MAX_WARN && <li>…and {csv.warnings.length - MAX_WARN} more</li>}</ul>
            </div>
          )}
          {csv.rows.length > 0 && (
            <div className="csv-preview">
              {csv.rows.slice(0, 6).map((r) => (
                <div key={`${r.date}${r.title}`} className="csv-row"><span className="muted tiny">{fmt(r.date, { day: 'numeric', month: 'short', year: 'numeric' })}</span><span className="small">{r.title}</span><span className="muted tiny">{r.psalmistIds ? r.psalmistIds.map((id) => data.members.find((m) => m.id === id)?.name).join(', ') : '—'}</span></div>
              ))}
              {csv.rows.length > 6 && <div className="muted tiny" style={{ padding: '6px 0' }}>…and {csv.rows.length - 6} more rows</div>}
            </div>
          )}
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={() => setCsv({})}>Choose another file</button>
            <button className="btn btn-pri" disabled={busy || !csv.summary || (!csv.summary.added && !csv.summary.updated)} onClick={applyCsv}>{busy ? 'Importing…' : csv.summary && !csv.summary.added && !csv.summary.updated ? 'Nothing to change' : 'Import'}</button>
          </div>
        </>)}
      </Modal>

      <Modal open={!!edit} wide onClose={() => setEdit(null)} title={edit?.id ? 'Edit day' : 'Add a day or event'}>
        {edit && (<>
          <div className="grid g2">
            <div className="field"><label className="label" htmlFor="ps-date">Date</label><input id="ps-date" type="date" className="input" value={edit.date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="field"><label className="label" htmlFor="ps-rank">Type</label><select id="ps-rank" className="input" value={edit.rank} onChange={(e) => setEdit({ ...edit, rank: e.target.value, auto: false })}>{RANKS.map((r) => <option key={r}>{r}</option>)}</select></div>
          </div>
          <div className="field">
            <label className="label" htmlFor="ps-title">Title {edit.date && <button type="button" className="chip sm link" onClick={useCalendar}>Use the calendar's title</button>}</label>
            <input id="ps-title" className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value, auto: false })} placeholder="e.g. Third Sunday of Advent, Harvest Thanksgiving, Choir anniversary" />
          </div>
          <div className="grid g2">
            <div className="field"><label className="label" htmlFor="ps-season">Season</label><select id="ps-season" className="input" value={edit.season} onChange={(e) => setEdit({ ...edit, season: e.target.value })}>{SEASONS.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div className="field"><label className="label" htmlFor="ps-cycle">Cycle</label><input id="ps-cycle" className="input" value={edit.cycle} onChange={(e) => setEdit({ ...edit, cycle: e.target.value })} placeholder="e.g. Year A" /></div>
          </div>
          <div className="field">
            <label className="label">Psalmist(s) <span className="muted">— {edit.psalmistIds.length} of up to {MAX_PSALMISTS}</span></label>
            <div className="ps-chosen">{edit.psalmistIds.map((id) => { const m = data.members.find((x) => x.id === id); return <button type="button" key={id} className="chip sm ps-on" onClick={() => togglePsalmist(id)}>{m?.name || 'Former member'} ✕</button>; })}</div>
            <input className="input" value={who} onChange={(e) => setWho(e.target.value)} placeholder="Search members…" style={{ marginTop: 6 }} />
            <div className="ps-pickers">
              {data.members.filter((m) => !edit.psalmistIds.includes(m.id) && m.name.toLowerCase().includes(who.toLowerCase())).slice(0, 30).map((m) => (
                <button type="button" key={m.id} className="chip sm" onClick={() => togglePsalmist(m.id)}>{m.name}{m.part ? ` · ${m.part}` : ''}</button>
              ))}
            </div>
          </div>
          <div className="field"><label className="label" htmlFor="ps-note">Note (optional)</label><input id="ps-note" className="input" value={edit.note} maxLength={500} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="e.g. Psalm 85 — Lord, let us see your kindness" /></div>
          <div className="modal-foot" style={{ justifyContent: 'space-between' }}>
            <div>{edit.id && (confirmDelete
              ? <button className="btn btn-sm btn-danger-soft" disabled={busy} onClick={remove}>Yes, remove this day</button>
              : <button className="btn btn-sm btn-ghost" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={12} /> Remove</button>)}</div>
            <div className="chip-row">
              <button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn btn-pri" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
          {edit.id && edit.published && <p className="muted tiny" style={{ marginBottom: 0 }}>This day is published: members see your changes straight away, and new psalmists get their reminders.</p>}
        </>)}
      </Modal>
    </div>
  );
}
