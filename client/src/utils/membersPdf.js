// The choir list as a PDF, ready to print: names only, or with the details chosen.
const NAVY = [26, 44, 96];
const GOLD = [233, 166, 58];
const INK = [34, 49, 95];
const MUT = [139, 127, 106];
const CREAM = [246, 239, 223];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Birthdays show the day and month only, never the year
const birthday = (dob) => {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(dob || '');
  return m ? `${Number(m[2])} ${MONTHS[Number(m[1]) - 1]}` : '';
};
const joinedText = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

// Each optional column: heading, value, share of the spare width
export const DETAIL_COLUMNS = [
  { id: 'part', label: 'Part', get: (u) => u.voice || '', w: 0.7 },
  { id: 'roles', label: 'Roles', get: (u, roleLabel) => roleLabel(u), w: 1.4 },
  { id: 'email', label: 'Email', get: (u) => u.email || '', w: 1.7 },
  { id: 'phone', label: 'Phone', get: (u) => u.phone || '', w: 1.1 },
  { id: 'birthday', label: 'Birthday', get: (u) => birthday(u.dob), w: 0.7 },
  { id: 'country', label: 'Country', get: (u) => u.country || '', w: 0.9 },
  { id: 'joined', label: 'Joined', get: (u) => joinedText(u.joined), w: 0.8 },
];

// members: already filtered and sorted; columns: ids from DETAIL_COLUMNS; groupByPart: one table per part
export async function membersPdf({ members, title, subtitle, columns = [], signature = false, groupByPart = false, roleLabel, print = false }) {
  const [{ jsPDF }, table] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = [table.default, table.default?.default].find((f) => typeof f === 'function');
  // Grouped by part, the part is in each group's heading, so it is not repeated in a column
  const cols = DETAIL_COLUMNS.filter((c) => columns.includes(c.id) && !(groupByPart && c.id === 'part'));
  const wide = cols.length > 4 || (cols.length > 3 && signature);
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: wide ? 'landscape' : 'portrait' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;

  // ----- heading -----
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 78, 'F');
  doc.setFillColor(...GOLD); doc.rect(0, 78, W, 3, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...GOLD);
  doc.text('ST. BARNABAS AMAZING VOICES CHOIR', M, 28);
  doc.setTextColor(255, 255, 255); doc.setFontSize(19);
  doc.text(title, M, 52);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(198, 205, 228);
  doc.text(subtitle, M, 68);
  const count = `${members.length} member${members.length === 1 ? '' : 's'}`;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  const cw = doc.getTextWidth(count) + 16;
  doc.setFillColor(...GOLD); doc.roundedRect(W - M - cw, 22, cw, 18, 4, 4, 'F');
  doc.setTextColor(...NAVY); doc.text(count, W - M - cw / 2, 34, { align: 'center' });

  // ----- the table(s) -----
  const head = ['#', 'Name', ...cols.map((c) => c.label), ...(signature ? ['Signature'] : [])];
  const free = W - 2 * M - 26;
  const nameShare = cols.length ? 1.5 : 1;
  const sigShare = signature ? 1.3 : 0;
  const total = nameShare + sigShare + cols.reduce((a, c) => a + c.w, 0);
  const columnStyles = { 0: { cellWidth: 26, halign: 'right', textColor: MUT } };
  columnStyles[1] = { cellWidth: (free * nameShare) / total, fontStyle: 'bold' };
  cols.forEach((c, i) => { columnStyles[i + 2] = { cellWidth: (free * c.w) / total }; });
  if (signature) columnStyles[cols.length + 2] = { cellWidth: (free * sigShare) / total };

  const groups = groupByPart
    ? [...new Set(members.map((u) => u.voice || 'Part not set'))]
      .sort((a, b) => (a === 'Part not set') - (b === 'Part not set') || ['Soprano', 'Alto', 'Tenor', 'Bass'].indexOf(a) - ['Soprano', 'Alto', 'Tenor', 'Bass'].indexOf(b))
      .map((g) => [g, members.filter((u) => (u.voice || 'Part not set') === g)])
    : [[null, members]];

  let y = 100;
  groups.forEach(([name, list]) => {
    if (name) {
      if (y > H - 90) { doc.addPage(); y = M + 8; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...INK);
      doc.text(`${name}  ·  ${list.length}`, M, y);
      y += 8;
    }
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, bottom: 44 },
      head: [head],
      body: list.map((u, i) => [i + 1, u.name, ...cols.map((c) => c.get(u, roleLabel)), ...(signature ? [''] : [])]),
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: cols.length > 4 ? 8 : 9, cellPadding: signature ? { top: 9, bottom: 9, left: 5, right: 5 } : 5, textColor: INK, lineColor: [226, 216, 196], lineWidth: 0.5, overflow: 'linebreak' },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [252, 249, 242] },
      columnStyles,
    });
    y = doc.lastAutoTable.finalY + 22;
  });

  // ----- footer on every page -----
  const pages = doc.internal.getNumberOfPages();
  const printed = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(...CREAM); doc.line(M, H - 30, W - M, H - 30);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUT);
    doc.text(`Printed ${printed} from avcsb.com${cols.some((c) => ['email', 'phone', 'birthday'].includes(c.id)) ? '  ·  contains personal details: keep it within the choir' : ''}`, M, H - 18);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 18, { align: 'right' });
  }

  const file = `AVC-${title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}.pdf`;
  if (print) {
    doc.autoPrint();
    const url = doc.output('bloburl');
    const win = window.open(url, '_blank');
    if (!win) doc.save(file); // pop-ups blocked: download instead
    return;
  }
  doc.save(file);
}
