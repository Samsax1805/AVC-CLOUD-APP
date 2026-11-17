import { fmtNum, fmtPct, monthLabel, shortMonth, toMinor, UNITEMISED } from './financeMath';

// The monthly financial report as a PDF, laid out like the choir's spreadsheet report.
// The built-in PDF fonts have no ₺ or ₦ sign, so amounts are shown with the currency code (TL 22,401).
const NAVY = [26, 44, 96];
const GOLD = [233, 166, 58];
const INK = [34, 49, 95];
const MUT = [139, 127, 106];
const GREEN = [4, 120, 87];
const RED = [185, 28, 28];
const CREAM = [246, 239, 223];

const dateText = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

export async function financePdf({ book, sheet, report, history = [], ytd }) {
  const [{ jsPDF }, table] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = [table.default, table.default?.default].find((f) => typeof f === 'function');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  const base = book.base;
  const published = sheet.status === 'published';
  const money = (m) => fmtNum(m);
  const showEx = report.currencies.some((c) => c.ex);

  // ----- heading -----
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 92, 'F');
  doc.setFillColor(...GOLD); doc.rect(0, 92, W, 3, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...GOLD);
  doc.text('ST. BARNABAS AMAZING VOICES CHOIR', M, 30);
  doc.setTextColor(255, 255, 255); doc.setFontSize(20);
  doc.text(`Financial Report — ${monthLabel(sheet.month)}`, M, 56);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(198, 205, 228);
  doc.text(`${book.name}  ·  each currency in its own money, and all together in ${base}`, M, 75);
  // Status stamp
  const stamp = published ? `PUBLISHED ${dateText(sheet.publishedAt).toUpperCase()}` : `DRAFT — ${String(sheet.statusLabel || sheet.status).toUpperCase()}`;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  const sw = doc.getTextWidth(stamp) + 16;
  doc.setFillColor(...(published ? GREEN : RED)); doc.roundedRect(W - M - sw, 22, sw, 18, 4, 4, 'F');
  doc.setTextColor(255, 255, 255); doc.text(stamp, W - M - sw / 2, 34, { align: 'center' });

  // ----- closing balance boxes: one per currency, then all together -----
  const boxes = [...report.currencies.map((c) => ({ t: `${c.code} CLOSING BALANCE`, v: `${c.code} ${money(c.close)}`, s: `B/F ${money(c.bf)}  |  In ${money(c.inc)}  |  Out ${money(c.exp)}${c.ex ? `  |  Exch ${c.ex > 0 ? '+' : ''}${money(c.ex)}` : ''}`, neg: c.close < 0 })),
    { t: `ALL TOGETHER (${base} equiv.)`, v: `${base} ${money(report.combined.close)}`, s: `B/F ${money(report.combined.bf)}  |  In ${money(report.combined.inc)}  |  Out ${money(report.combined.exp)}`, total: true }];
  const per = Math.min(boxes.length, 3);
  const gap = 8;
  const bw = (W - 2 * M - gap * (per - 1)) / per;
  let y = 110;
  boxes.forEach((b, i) => {
    const col = i % per;
    if (i && col === 0) y += 62;
    const x = M + col * (bw + gap);
    doc.setFillColor(...(b.total ? NAVY : CREAM)); doc.roundedRect(x, y, bw, 54, 5, 5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...(b.total ? GOLD : MUT));
    doc.text(b.t, x + 10, y + 15);
    doc.setFontSize(15); doc.setTextColor(...(b.total ? [255, 255, 255] : b.neg ? RED : INK));
    doc.text(b.v, x + 10, y + 34);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...(b.total ? [198, 205, 228] : MUT));
    doc.text(b.s, x + 10, y + 47, { maxWidth: bw - 16 });
  });
  y += 70;

  const head = { fillColor: NAVY, textColor: [240, 234, 216], fontStyle: 'bold', fontSize: 7.5 };
  const totalRow = { fillColor: [243, 233, 210], textColor: INK, fontStyle: 'bold' };
  const section = (title, at) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...INK);
    doc.text(title, M, at);
    doc.setDrawColor(...GOLD); doc.setLineWidth(1.2); doc.line(M, at + 4, M + 28, at + 4);
    return at + 10;
  };
  const after = () => doc.lastAutoTable.finalY + 22;
  const room = (need) => { if (y + need > H - 60) { doc.addPage(); y = 50; } };
  // Totals line up under their numbers (the table's column alignment only covers the body rows)
  const alignFoot = (d) => { if (d.section === 'foot' && d.column.index > 0) d.cell.styles.halign = 'right'; };
  const common = { didParseCell: alignFoot, margin: { left: M, right: M, bottom: 50 }, styles: { fontSize: 8.5, cellPadding: 5, textColor: INK, lineColor: [240, 233, 218], lineWidth: 0.5 }, headStyles: head, alternateRowStyles: { fillColor: [252, 249, 241] } };
  const right = (cols) => Object.fromEntries(cols.map((c) => [c, { halign: 'right' }]));

  // ----- money by currency -----
  y = section('MONEY BY CURRENCY  (each currency in its own money)', y);
  const cHead = ['Currency', 'Brought forward', 'Income', 'Expenses', ...(showEx ? ['Exchanged'] : []), 'Closing balance', `Rate (${base} for 1)`, `Closing in ${base}`];
  const cRows = report.currencies.map((c) => [`${c.name} (${c.code})`, money(c.bf), money(c.inc), money(c.exp), ...(showEx ? [`${c.ex > 0 ? '+' : ''}${money(c.ex)}`] : []), money(c.close), String(c.rate), money(c.closeBase)]);
  const comb = report.combined;
  autoTable(doc, {
    ...common, startY: y, head: [cHead], body: cRows,
    foot: [[`ALL TOGETHER (${base} equiv.)`, money(comb.bf), money(comb.inc), money(comb.exp), ...(showEx ? [`${comb.ex > 0 ? '+' : ''}${money(comb.ex)}`] : []), money(comb.close), '', money(comb.close)]],
    footStyles: totalRow, columnStyles: right(cHead.map((_, i) => i).slice(1)),
  });
  y = after();

  // ----- income and expenses by category, with a bar for each share -----
  const bars = (title, list, total, color) => {
    room(90);
    y = section(title, y);
    autoTable(doc, {
      ...common, startY: y,
      head: [['Category', `Amount (${base} equiv.)`, '% of total', 'Share']],
      body: list.length ? list.map((x) => [x.name, money(x.amount), fmtPct(x.pct), '']) : [['Nothing recorded this month', '', '', '']],
      foot: [[`TOTAL ${title.startsWith('WHERE THE MONEY CAME') ? 'INCOME' : 'EXPENSES'}`, money(total), total ? '100%' : '', '']],
      footStyles: totalRow,
      columnStyles: { 1: { halign: 'right', cellWidth: 110 }, 2: { halign: 'right', cellWidth: 62 }, 3: { cellWidth: 130 } },
      didParseCell: (d) => { if (d.section === 'foot' && (d.column.index === 1 || d.column.index === 2)) d.cell.styles.halign = 'right'; },
      didDrawCell: (d) => {
        if (d.section !== 'body' || d.column.index !== 3) return;
        const item = list[d.row.index];
        if (!item?.pct) return;
        const w = (d.cell.width - 10) * Math.max(0, Math.min(1, item.pct));
        doc.setFillColor(...color); doc.roundedRect(d.cell.x + 5, d.cell.y + d.cell.height / 2 - 3.5, Math.max(w, 1.5), 7, 2, 2, 'F');
      },
    });
    y = after();
  };
  bars('WHERE THE MONEY CAME FROM  (INCOME)', report.income, comb.inc, GREEN);
  bars('WHERE THE MONEY WAS SPENT  (EXPENSES)', report.expense, comb.exp, RED);
  if (report.unitemised > 0) {
    room(30);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...RED);
    doc.text(`NOTE: ${base} ${money(report.unitemised)} (equivalent) of this month's expenses is still "${UNITEMISED}" by the Finance Secretary.`, M, y - 6, { maxWidth: W - 2 * M });
    y += 10;
  }

  // ----- funds -----
  if (report.funds.length) {
    room(90);
    y = section(`FUNDS — MOVEMENT THIS MONTH  (${base} equivalent)`, y);
    autoTable(doc, {
      ...common, startY: y, head: [['Fund', 'Income', 'Expenses', 'Net movement']],
      body: report.funds.map((f) => [f.name, money(f.inc), money(f.exp), money(f.net)]),
      foot: [['ALL FUNDS', money(comb.inc), money(comb.exp), money(comb.inc - comb.exp)]], footStyles: totalRow,
      columnStyles: right([1, 2, 3]),
      didParseCell: (d) => { alignFoot(d); if (d.section === 'body' && d.column.index === 3 && report.funds[d.row.index]?.net < 0) d.cell.styles.textColor = RED; },
    });
    y = after();
  }

  // ----- every entry -----
  const entries = [...(sheet.entries || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  if (entries.length) {
    room(90);
    y = section('TRANSACTIONS THIS MONTH', y);
    const rate = (code) => report.byCode[code]?.rate || 0;
    autoTable(doc, {
      ...common, startY: y, styles: { ...common.styles, fontSize: 7.5, cellPadding: 4 },
      head: [['Date', 'Type', 'Category', 'Fund', 'Details', 'Amount', `${base} equiv.`]],
      body: entries.map((e) => {
        const amt = toMinor(e.amount);
        if (e.type === 'exchange') return [e.date || '', 'Exchange', `${e.currency} to ${e.toCurrency}`, '', e.details || '', `${e.currency} ${money(amt)} to ${e.toCurrency} ${money(toMinor(e.toAmount))}`, ''];
        return [e.date || '', e.type === 'income' ? 'Income' : 'Expense', e.category || '', e.fund || '', e.details || '', `${e.currency} ${money(amt)}`, money(Math.round(amt * rate(e.currency)))];
      }),
      columnStyles: { 0: { cellWidth: 52 }, 1: { cellWidth: 46 }, 5: { halign: 'right' }, 6: { halign: 'right' } },
      didParseCell: (d) => {
        if (d.section !== 'body' || d.column.index !== 1) return;
        const t = entries[d.row.index]?.type;
        d.cell.styles.textColor = t === 'income' ? GREEN : t === 'expense' ? RED : INK;
        d.cell.styles.fontStyle = 'bold';
      },
    });
    y = after();
  }

  // ----- members' dues and lateness -----
  const mem = report.members;
  if (mem.rows.length) {
    room(90);
    y = section(`MEMBER DUES, LATENESS & ABSENTEEISM  (${base})`, y);
    autoTable(doc, {
      ...common, startY: y, head: [['Member', 'Weekly dues', 'Lateness & absenteeism', 'Total']],
      body: mem.rows.map((m) => [m.name, money(m.duesMinor), money(m.latenessMinor), money(m.totalMinor)]),
      foot: [['ALL MEMBERS — TOTAL', money(mem.dues), money(mem.lateness), money(mem.total)]], footStyles: totalRow,
      columnStyles: right([1, 2, 3]),
    });
    y = after();
  }

  // ----- month by month -----
  if (history.length) {
    room(100);
    y = section(`MONTH-BY-MONTH SUMMARY  (${base} equivalent)`, y);
    const codes = report.currencies.map((c) => c.code);
    autoTable(doc, {
      ...common, startY: y, styles: { ...common.styles, fontSize: 7.5, cellPadding: 4 },
      head: [['Month', 'Brought forward', 'Income', 'Expenses', 'Closing', ...codes.map((c) => `Closing ${c}`)]],
      body: history.map((h) => [shortMonth(h.month), money(h.bf), money(h.inc), money(h.exp), money(h.close), ...codes.map((c) => money(h.closeBy[c] || 0))]),
      columnStyles: right([1, 2, 3, 4, ...codes.map((_, i) => 5 + i)]),
      didParseCell: (d) => { if (d.section === 'body' && history[d.row.index]?.month === sheet.month) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [253, 243, 220]; } },
    });
    y = after();
  }
  if (ytd && ytd.months > 1) {
    room(60);
    y = section(`YEAR TO DATE ${ytd.year}  (${ytd.months} months, ${base} equivalent)`, y);
    autoTable(doc, {
      ...common, startY: y, head: [['', 'Income', 'Expenses', 'Net']],
      body: [['Totals', money(ytd.inc), money(ytd.exp), money(ytd.net)]], columnStyles: right([1, 2, 3]),
    });
    y = after();
  }

  // ----- notes and sign-off -----
  if (sheet.notes) {
    room(60);
    y = section('NOTES FROM THE FINANCE SECRETARY', y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(sheet.notes, W - 2 * M);
    lines.forEach((l) => { room(14); doc.text(l, M, y + 4); y += 12; });
    y += 14;
  }
  room(52);
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.6); doc.line(M, y, W - M, y);
  y += 18;
  const half = (W - 2 * M) / 2;
  const sign = (x, title, name, when) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...MUT); doc.text(title, x, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...INK); doc.text(name || '—', x, y + 15);
    if (when) { doc.setFontSize(8); doc.setTextColor(...MUT); doc.text(when, x, y + 28); }
  };
  sign(M, 'PREPARED BY (FINANCE SECRETARY)', sheet.preparedByName, sheet.submittedAt ? `Sent for review ${dateText(sheet.submittedAt)}` : '');
  sign(M + half, 'REVIEWED & PUBLISHED BY', published ? sheet.publishedByName : 'Not yet approved', published ? dateText(sheet.publishedAt) : '');

  // ----- footer on every page -----
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(150, 150, 150);
    doc.text(`AVC Financial Report · ${monthLabel(sheet.month)} · ${book.name} · generated ${dateText(new Date())}`, M, H - 22);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 22, { align: 'right' });
  }
  const file = `AVC-Financial-Report-${monthLabel(sheet.month).replace(' ', '-')}${published ? '' : '-DRAFT'}.pdf`;
  doc.save(file);
  return file;
}
