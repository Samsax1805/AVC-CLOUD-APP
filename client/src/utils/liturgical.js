// Roman Catholic liturgical calendar as kept in Nigeria: General Roman Calendar with Epiphany and
// Corpus Christi on Sunday, Ascension on Thursday, and Our Lady Queen of Nigeria (1 October).
// Checked against GCatholic's Nigeria calendars for 2026 and 2027. Dates are 'YYYY-MM-DD' strings, worked out in UTC.
// Covers Sundays, solemnities, the main feasts of the Lord, Holy Week and every weekday's title.

const DAY = 864e5;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORD = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth'];
const TENS = { 20: 'Twenty', 30: 'Thirty' };
export const ordinal = (n) => (n <= 20 ? ORD[n] : n === 30 ? 'Thirtieth' : `${TENS[Math.floor(n / 10) * 10]}-${ORD[n % 10].toLowerCase()}`);

const D = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
export const iso = (d) => d.toISOString().slice(0, 10);
export const parse = (s) => new Date(`${s}T00:00:00Z`);
const add = (d, n) => new Date(d.getTime() + n * DAY);
const dow = (d) => d.getUTCDay();
const weeksBetween = (a, b) => Math.floor((b - a) / (7 * DAY));
const sundayOnOrBefore = (d) => add(d, -dow(d));

// Anonymous Gregorian algorithm
export const easter = (y) => {
  const a = y % 19; const b = Math.floor(y / 100); const c = y % 100;
  const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25); const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30; const i = Math.floor(c / 4); const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7; const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); const day = ((h + l - 7 * m + 114) % 31) + 1;
  return D(y, month, day);
};
export const advent1 = (y) => { const xmas = D(y, 12, 25); return add(xmas, -(dow(xmas) || 7) - 21); };
// Nigeria keeps Epiphany on the Sunday between 2 and 8 January
const epiphany = (y) => { const j2 = D(y, 1, 2); return add(j2, (7 - dow(j2)) % 7); };
const baptism = (y) => { const e = epiphany(y); return e.getUTCDate() >= 7 ? add(e, 1) : add(e, 7); };

// Sunday cycle A/B/C and weekday cycle I/II belong to the liturgical year, which starts on Advent Sunday
export const cycles = (d) => {
  const y = d >= advent1(d.getUTCFullYear()) ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
  return { sunday: { 1: 'A', 2: 'B', 0: 'C' }[y % 3], weekday: y % 2 ? 'I' : 'II', litYear: y };
};

export const SEASONS = ['Advent', 'Christmas', 'Ordinary Time', 'Lent', 'Holy Week', 'Easter Triduum', 'Easter'];
export const SEASON_COLOR = { Advent: '#6d28d9', Christmas: '#d4a017', 'Ordinary Time': '#15803d', Lent: '#6d28d9', 'Holy Week': '#b91c1c', 'Easter Triduum': '#7f1d1d', Easter: '#d4a017' };
export const VESTMENT = { violet: '#6d28d9', white: '#d4a017', green: '#15803d', red: '#b91c1c', rose: '#db2777', black: '#1f2937' };

// Celebrations on fixed or computed dates for calendar year y: [date, title, rank, vestment]
const celebrations = (y) => {
  const E = easter(y);
  const xmas = D(y, 12, 25);
  const holyFamily = dow(xmas) === 0 ? D(y, 12, 30) : add(xmas, 7 - dow(xmas));
  const list = [
    [D(y, 1, 1), 'Solemnity of Mary, the Holy Mother of God', 'Solemnity', 'white'],
    [epiphany(y), 'The Epiphany of the Lord', 'Solemnity', 'white'],
    [baptism(y), 'The Baptism of the Lord', 'Feast', 'white'],
    [D(y, 2, 2), 'The Presentation of the Lord', 'Feast', 'white'],
    [add(E, -46), 'Ash Wednesday', 'Ash Wednesday', 'violet'],
    [add(E, -7), "Palm Sunday of the Lord's Passion", 'Sunday', 'red'],
    [add(E, -3), "Holy Thursday – Mass of the Lord's Supper", 'Triduum', 'white'],
    [add(E, -2), "Good Friday – Celebration of the Lord's Passion", 'Triduum', 'red'],
    [add(E, -1), 'Holy Saturday – The Easter Vigil', 'Triduum', 'white'],
    [E, "Easter Sunday of the Lord's Resurrection", 'Solemnity', 'white'],
    [add(E, 7), 'Second Sunday of Easter (Divine Mercy Sunday)', 'Sunday', 'white'],
    [add(E, 39), 'The Ascension of the Lord', 'Solemnity', 'white'],
    [add(E, 49), 'Pentecost Sunday', 'Solemnity', 'red'],
    [add(E, 56), 'The Most Holy Trinity', 'Solemnity', 'white'],
    [add(E, 63), 'The Most Holy Body and Blood of Christ (Corpus Christi)', 'Solemnity', 'white'],
    [add(E, 68), 'The Most Sacred Heart of Jesus', 'Solemnity', 'white'],
    [D(y, 6, 11), 'St Barnabas, Apostle – Parish Patronal Feast', 'Solemnity', 'red'],
    [D(y, 6, 24), 'The Nativity of St John the Baptist', 'Solemnity', 'white'],
    [D(y, 6, 29), 'Saints Peter and Paul, Apostles', 'Solemnity', 'red'],
    [D(y, 8, 6), 'The Transfiguration of the Lord', 'Feast', 'white'],
    [D(y, 8, 15), 'The Assumption of the Blessed Virgin Mary', 'Solemnity', 'white'],
    [D(y, 9, 14), 'The Exaltation of the Holy Cross', 'Feast', 'red'],
    [D(y, 10, 1), 'Our Lady, Queen of Nigeria', 'Solemnity', 'white'],
    [D(y, 11, 1), 'All Saints', 'Solemnity', 'white'],
    [D(y, 11, 2), 'The Commemoration of All the Faithful Departed (All Souls)', 'Commemoration', 'violet'],
    [D(y, 11, 9), 'The Dedication of the Lateran Basilica', 'Feast', 'white'],
    [add(advent1(y), -7), 'Our Lord Jesus Christ, King of the Universe', 'Solemnity', 'white'],
    [D(y, 12, 8), 'The Immaculate Conception of the Blessed Virgin Mary', 'Solemnity', 'white'],
    [xmas, 'The Nativity of the Lord (Christmas)', 'Solemnity', 'white'],
    [holyFamily, 'The Holy Family of Jesus, Mary and Joseph', 'Feast', 'white'],
  ];
  // Transfers: a solemnity never displaces an Advent/Lent/Easter Sunday or Holy Week; lesser feasts are simply omitted
  const palm = add(E, -7);
  const octaveEnd = add(E, 7);
  const privilegedSunday = (x) => dow(x) === 0 && !['Ordinary Time', 'Christmas'].includes(season(x).name);
  const moved = list.map(([d, t, r, v]) => {
    if (t.startsWith('The Immaculate') && dow(d) === 0) return [add(d, 1), t, r, v];
    if ((r === 'Feast' || r === 'Commemoration') && privilegedSunday(d) && !t.startsWith('The Baptism') && !t.startsWith('The Holy Family')) return null;
    return [d, t, r, v];
  }).filter(Boolean);
  // St Joseph goes to the Saturday before Palm Sunday in Holy Week; the Annunciation to the Monday after Divine Mercy Sunday
  for (const [d, t] of [[D(y, 3, 19), 'Saint Joseph, Spouse of the Blessed Virgin Mary'], [D(y, 3, 25), 'The Annunciation of the Lord']]) {
    let date = d;
    if (d >= palm && d <= octaveEnd) date = t.startsWith('Saint') ? add(palm, -1) : add(octaveEnd, 1);
    else if (dow(d) === 0) date = add(d, 1);
    moved.push([date, t, 'Solemnity', 'white']);
  }
  return moved;
};

// Season, week and vestment colour for a date
export function season(d) {
  const y = d.getUTCFullYear();
  const E = easter(y); const a1 = advent1(y); const ash = add(E, -46); const palm = add(E, -7); const pent = add(E, 49);
  if (d >= a1 && d < D(y, 12, 25)) return { name: 'Advent', week: weeksBetween(a1, d) + 1, color: 'violet' };
  if (d >= D(y, 12, 25) || d <= baptism(y)) return { name: 'Christmas', week: 0, color: 'white' };
  if (d < ash) return { name: 'Ordinary Time', week: weeksBetween(sundayOnOrBefore(baptism(y)), d) + 1, color: 'green' };
  if (d < add(E, -42)) return { name: 'Lent', week: 0, color: 'violet' };
  if (d < palm) return { name: 'Lent', week: weeksBetween(add(E, -42), d) + 1, color: 'violet' };
  if (d < add(E, -3)) return { name: 'Holy Week', week: 0, color: 'violet' };
  if (d < E) return { name: 'Easter Triduum', week: 0, color: 'white' };
  if (d <= pent) return { name: 'Easter', week: weeksBetween(E, d) + 1, color: 'white' };
  return { name: 'Ordinary Time', week: 34 - weeksBetween(sundayOnOrBefore(d), add(a1, -7)), color: 'green' };
}

const sundayTitle = (d, s) => {
  if (s.name === 'Advent') return `${ordinal(s.week)} Sunday of Advent`;
  if (s.name === 'Lent') return `${ordinal(s.week)} Sunday of Lent`;
  if (s.name === 'Easter') return `${ordinal(s.week)} Sunday of Easter`;
  if (s.name === 'Christmas') return 'Second Sunday after the Nativity';
  return `${ordinal(s.week)} Sunday in Ordinary Time`;
};
const weekdayTitle = (d, s) => {
  const wd = WEEKDAYS[dow(d)];
  const E = easter(d.getUTCFullYear());
  if (s.name === 'Advent') return d.getUTCMonth() === 11 && d.getUTCDate() >= 17 ? `${d.getUTCDate()} December – Advent Weekday` : `${wd} of the ${ordinal(s.week)} Week of Advent`;
  if (s.name === 'Christmas') return d.getUTCMonth() === 11 && d.getUTCDate() <= 31 ? `${ordinal(d.getUTCDate() - 24)} Day within the Octave of Christmas` : `${wd} – Christmas Weekday`;
  if (s.name === 'Lent') return s.week === 0 ? `${wd} after Ash Wednesday` : `${wd} of the ${ordinal(s.week)} Week of Lent`;
  if (s.name === 'Holy Week') return `${wd} of Holy Week`;
  if (s.name === 'Easter') return d < add(E, 7) ? `${wd} within the Octave of Easter` : `${wd} of the ${ordinal(s.week)} Week of Easter`;
  return `${wd} of the ${ordinal(s.week)} Week in Ordinary Time`;
};

const RANK_ORDER = { Triduum: 0, Solemnity: 1, Sunday: 2, 'Ash Wednesday': 2, Feast: 3, Commemoration: 3, Weekday: 9 };

// Everything known about one date: { date, title, rank, season, color, cycle }
export function describe(dateStr) {
  const d = parse(dateStr);
  const s = season(d);
  const c = cycles(d);
  const fixed = celebrations(d.getUTCFullYear()).find(([x]) => iso(x) === dateStr);
  const sunday = dow(d) === 0;
  let title; let rank; let color = s.color;
  if (fixed) { [, title, rank, color] = fixed; }
  else if (sunday) { title = sundayTitle(d, s); rank = 'Sunday'; if (s.name === 'Advent' && s.week === 3) color = 'rose'; if (s.name === 'Lent' && s.week === 4) color = 'rose'; }
  else { title = weekdayTitle(d, s); rank = 'Weekday'; }
  const cycle = rank === 'Weekday' ? `Weekday Year ${c.weekday}` : `Year ${c.sunday}`;
  return { date: dateStr, title, rank, season: s.name, color, cycle };
}

// Every Sunday and celebration of calendar year y, in date order
export function yearCalendar(y) {
  const out = new Map();
  for (let d = D(y, 1, 1); d.getUTCFullYear() === y; d = add(d, 1)) {
    const day = describe(iso(d));
    if (day.rank !== 'Weekday') out.set(day.date, day);
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date) || RANK_ORDER[a.rank] - RANK_ORDER[b.rank]);
}
