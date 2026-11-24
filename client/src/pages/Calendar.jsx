import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Icon from '../components/ui/Icon';
import Modal from '../components/ui/Modal';
import { participates } from '../hooks/usePermissions';

// One place for the choir's week: rehearsals, services and meetings, the psalmist on duty,
// the songs for the day (setlist), birthdays and each member's own attendance.
export const EVENT_TYPES = {
  rehearsal: { label: 'Rehearsal', color: '#0369a1' },
  service: { label: 'Service', color: '#7c3aed' },
  meeting: { label: 'Meeting', color: '#b45309' },
  social: { label: 'Social', color: '#059669' },
  other: { label: 'Other', color: '#64748b' },
};
const PARTS_OF_MASS = ['Entrance', 'Kyrie', 'Gloria', 'Psalm', 'Gospel Acclamation', 'Offertory', 'Holy', 'Memorial Acclamation', 'Great Amen', 'Lamb of God', 'Communion', 'Thanksgiving', 'Recessional', 'Marian hymn', 'Other'];
const pad = (n) => String(n).padStart(2, '0');
export const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => dstr(new Date());
const local = (s) => new Date(`${s}T00:00:00`);
const addDays = (s, n) => { const d = local(s); d.setDate(d.getDate() + n); return dstr(d); };
export const longDay = (s) => local(s).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const shortDay = (s) => local(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const monthTitle = (y, m) => new Date(y, m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const errMsg = (e) => e.response?.data?.msg || 'That did not work. Check your connection and try again.';
const isMedia = (s) => s && (!s.fileUrl || /^(audio|video)\//.test(s.mime || ''));
export const birthdaysOn = (users, date) => users.filter((u) => participates(u) && u.dob && u.dob.slice(5) === date.slice(5));

export default function CalendarPage({ ctx }) {
  const { me, users = [], songs = [], sessions = [], toast, playId, togglePlay } = ctx;
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [sel, setSel] = useState(todayStr());
  const [cal, setCal] = useState(null);
  const [failed, setFailed] = useState(false);
  const [eventForm, setEventForm] = useState(null);
  const [setForm, setSetForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  // The month on screen plus the weeks around it, and the next six weeks for "Coming up"
  const first = `${ym.y}-${pad(ym.m + 1)}-01`;
  const gridStart = addDays(first, -((local(first).getDay() + 6) % 7));
  const gridEnd = addDays(gridStart, 41);
  const from = gridStart < todayStr() ? gridStart : todayStr();
  const to = addDays(todayStr(), 42) > gridEnd ? addDays(todayStr(), 42) : gridEnd;
  const load = useCallback(() => api.get('/calendar', { params: { from, to } }).then(({ data }) => { setCal(data); setFailed(false); }).catch(() => setFailed(true)), [from, to]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => { ctx.loadSongs?.().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const songById = useMemo(() => Object.fromEntries(songs.map((s) => [s.id, s])), [songs]);
  const by = useMemo(() => {
    const m = {};
    const put = (d, k, v) => { (m[d] ||= { events: [], setlist: null, psalm: null, session: null, birthdays: [] }); if (k === 'events') m[d].events.push(v); else m[d][k] = v; };
    (cal?.events || []).forEach((e) => put(e.date, 'events', e));
    (cal?.setlists || []).forEach((s) => put(s.date, 'setlist', s));
    (cal?.psalmists || []).forEach((p) => put(p.date, 'psalm', p));
    sessions.forEach((s) => put(s.date, 'session', s));
    return m;
  }, [cal, sessions]);
  const dayInfo = (d) => ({ events: [], setlist: null, psalm: null, session: null, ...(by[d] || {}), birthdays: birthdaysOn(users, d) });

  const p = cal?.perms || {};
  const move = (n) => setYm(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const goToday = () => { setYm({ y: now.getFullYear(), m: now.getMonth() }); setSel(todayStr()); };

  const saveEvent = async (f) => {
    setBusy(true);
    try {
      const body = { date: f.date, start: f.start, end: f.end, title: f.title, type: f.type, place: f.place, notes: f.notes };
      if (f.id) await api.put(`/calendar/events/${f.id}`, { ...body, series: f.series });
      else await api.post('/calendar/events', { ...body, repeatWeeks: f.repeat ? f.weeks : 1 });
      toast(f.id ? 'Event updated' : f.repeat && f.weeks > 1 ? `Added every week, ${f.weeks} times` : 'Event added');
      setEventForm(null); setSel(f.date); await load();
    } catch (e) { toast(errMsg(e), 'err'); } finally { setBusy(false); }
  };
  const removeEvent = (e) => setConfirm({
    title: 'Remove this event', text: `Remove "${e.title}" on ${longDay(e.date)}?`, option: e.seriesId ? 'Also remove the later weeks of this repeating event' : null,
    run: async (series) => {
      setBusy(true);
      try { const { data } = await api.delete(`/calendar/events/${e.id}${series ? '?series=1' : ''}`); toast(data.removed > 1 ? `${data.removed} events removed` : 'Event removed'); setConfirm(null); await load(); } catch (err) { toast(errMsg(err), 'err'); } finally { setBusy(false); }
    },
  });
  const saveSetlist = async (f, published) => {
    setBusy(true);
    try {
      const { data } = await api.put(`/calendar/setlists/${f.date}`, { title: f.title, notes: f.notes, items: f.items.filter((i) => i.songId), published });
      toast(published ? (f.wasPublished ? 'Setlist updated: members see the changes' : 'Setlist published: members have been told') : 'Setlist saved as a draft');
      if (data.dropped) toast(`${data.dropped} song(s) are no longer in the Music Library and were left out`, 'err');
      setSetForm(null); await load();
    } catch (e) { toast(errMsg(e), 'err'); } finally { setBusy(false); }
  };
  const removeSetlist = (s) => setConfirm({
    title: 'Delete this setlist', text: `Delete the songs planned for ${longDay(s.date)}?${s.published ? ' Members will no longer see them.' : ''}`,
    run: async () => { setBusy(true); try { await api.delete(`/calendar/setlists/${s.date}`); toast('Setlist deleted'); setConfirm(null); setSetForm(null); await load(); } catch (e) { toast(errMsg(e), 'err'); } finally { setBusy(false); } },
  });

  if (failed && !cal) return <div className="card"><p className="muted small">The calendar could not be loaded. Check your connection and refresh.</p></div>;
  const info = dayInfo(sel);
  const upcoming = Array.from({ length: 42 }, (_, i) => addDays(todayStr(), i)).map((d) => [d, dayInfo(d)])
    .filter(([, x]) => x.events.length || x.setlist || x.psalm || x.birthdays.length).slice(0, 12);
  const openSetlist = (date) => {
    const s = by[date]?.setlist;
    setSetForm({ date, title: s?.title || '', notes: s?.notes || '', items: s?.items?.length ? s.items.map((i) => ({ ...i })) : [{ songId: '', label: 'Entrance', note: '' }], wasPublished: !!s?.published, exists: !!s });
  };

  return (
    <div className="stack cal">
      <div className="page-head">
        <div><h2>Calendar</h2><p className="muted small">Rehearsals, services and meetings, the psalmist on duty, the songs for each day and birthdays, in one place.</p></div>
        <div className="head-actions">
          {p.events && <button className="btn btn-pri" onClick={() => setEventForm({ date: sel, start: '18:00', end: '20:00', title: '', type: 'rehearsal', place: '', notes: '', repeat: false, weeks: 8 })}><Icon name="plus" size={15} /> Add event</button>}
          {p.setlists && <button className="btn btn-soft" onClick={() => openSetlist(sel)}><Icon name="music" size={15} /> Plan songs</button>}
        </div>
      </div>

      <div className="cal-layout">
        <div className="card cal-month">
          <div className="cal-month-h">
            <button className="icon-btn" aria-label="Previous month" onClick={() => move(-1)}><Icon name="chevron-left" size={16} /></button>
            <h3>{monthTitle(ym.y, ym.m)}</h3>
            <button className="icon-btn" aria-label="Next month" onClick={() => move(1)}><Icon name="chevron-right" size={16} /></button>
            <button className="btn btn-sm btn-ghost" onClick={goToday}>Today</button>
          </div>
          <div className="cal-grid" role="grid">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="cal-dow">{d}</div>)}
            {Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)).map((d) => {
              const x = dayInfo(d);
              const out = local(d).getMonth() !== ym.m;
              const mine = x.session?.records?.[me.id];
              return (
                <button key={d} role="gridcell" aria-selected={d === sel} aria-label={longDay(d)}
                  className={`cal-day ${out ? 'out' : ''} ${d === todayStr() ? 'today' : ''} ${d === sel ? 'sel' : ''}`} onClick={() => setSel(d)}>
                  <span className="cal-num">{local(d).getDate()}</span>
                  <span className="cal-dots">
                    {x.events.slice(0, 3).map((e) => <i key={e.id} style={{ background: EVENT_TYPES[e.type]?.color }} />)}
                    {x.setlist && <i className="song" />}
                    {x.psalm && <i className="psalm" />}
                    {x.birthdays.length > 0 && <i className="bday" />}
                  </span>
                  {mine && <span className={`cal-me ${mine}`} title={`You: ${mine}`} />}
                </button>
              );
            })}
          </div>
          <div className="cal-key">
            {Object.entries(EVENT_TYPES).slice(0, 4).map(([k, t]) => <span key={k}><i style={{ background: t.color }} />{t.label}</span>)}
            <span><i className="song" />Songs</span><span><i className="psalm" />Psalmist</span><span><i className="bday" />Birthday</span>
          </div>
        </div>

        <div className="card cal-dayc">
          <div className="card-h"><h3>{longDay(sel)}</h3>{sel === todayStr() && <span className="chip sm">Today</span>}</div>
          <DayDetail date={sel} info={info} me={me} p={p} songById={songById} playId={playId} togglePlay={togglePlay}
            editEvent={(e) => setEventForm({ ...e, repeat: false, series: false })} removeEvent={removeEvent} openSetlist={openSetlist} />
        </div>
      </div>

      <div className="card">
        <div className="card-h"><h3>Coming up</h3><span className="muted tiny">next six weeks</span></div>
        {upcoming.length ? (
          <div className="cal-agenda">
            {upcoming.map(([d, x]) => (
              <button key={d} className="cal-ag-row" onClick={() => { setSel(d); setYm({ y: local(d).getFullYear(), m: local(d).getMonth() }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                <span className="cal-ag-date"><b>{local(d).getDate()}</b><small>{local(d).toLocaleDateString('en-GB', { weekday: 'short', month: 'short' })}</small></span>
                <span className="cal-ag-what">
                  {x.events.map((e) => <span key={e.id}><i style={{ background: EVENT_TYPES[e.type]?.color }} />{e.start && `${e.start} `}{e.title}</span>)}
                  {x.setlist && <span><i className="song" />Songs planned ({x.setlist.items.length}){!x.setlist.published && ' · draft'}</span>}
                  {x.psalm && <span><i className="psalm" />Psalmist: {x.psalm.people.map((q) => q.name).join(', ') || 'to be named'}</span>}
                  {x.birthdays.length > 0 && <span><i className="bday" />Birthday: {x.birthdays.map((u) => u.name.split(' ')[0]).join(', ')}</span>}
                </span>
              </button>
            ))}
          </div>
        ) : <p className="muted small">Nothing planned in the next six weeks yet.{p.events ? ' Press "Add event" to add the rehearsals and services.' : ''}</p>}
      </div>

      <Modal open={!!eventForm} onClose={() => setEventForm(null)} title={eventForm?.id ? 'Change event' : 'Add an event'}>
        {eventForm && <EventForm form={eventForm} set={setEventForm} busy={busy} save={saveEvent} close={() => setEventForm(null)} />}
      </Modal>
      <Modal open={!!setForm} onClose={() => setSetForm(null)} title={`Songs for ${setForm ? shortDay(setForm.date) : ''}`}>
        {setForm && <SetlistForm form={setForm} set={setSetForm} songs={songs} busy={busy} save={saveSetlist} remove={() => removeSetlist(by[setForm.date].setlist)} close={() => setSetForm(null)} />}
      </Modal>
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title || ''}>
        {confirm && <ConfirmBody c={confirm} busy={busy} close={() => setConfirm(null)} />}
      </Modal>
    </div>
  );
}

function ConfirmBody({ c, busy, close }) {
  const [opt, setOpt] = useState(false);
  return (<>
    <p className="small">{c.text}</p>
    {c.option && <label className="el-pick"><input type="checkbox" checked={opt} onChange={(e) => setOpt(e.target.checked)} /><span>{c.option}</span></label>}
    <div className="modal-foot"><button className="btn btn-ghost" onClick={close}>Keep it</button><button className="btn btn-danger-soft" disabled={busy} onClick={() => c.run(opt)}>{busy ? 'Working…' : 'Remove'}</button></div>
  </>);
}

/* ---------- Everything on one day ---------- */
export function SetlistSongs({ setlist, songById, me, playId, togglePlay }) {
  return (
    <ol className="cal-songs">
      {setlist.items.map((i, n) => {
        const s = songById[i.songId];
        const playing = s && playId === `song-${s.id}`;
        const myPart = s?.part && me.voice && s.part.toLowerCase().includes(String(me.voice).toLowerCase());
        return (
          <li key={`${i.songId}-${n}`} className={myPart ? 'mine' : ''}>
            {i.label && <span className="cal-song-lbl">{i.label}</span>}
            <span className="cal-song-t"><b>{s?.title || 'Song removed from the library'}</b>{(s?.part || i.note) && <small>{[s?.part, i.note].filter(Boolean).join(' · ')}</small>}</span>
            {myPart && <span className="chip sm ok">Your part</span>}
            {s?.fileUrl && isMedia(s) && <button className={`icon-btn ${playing ? 'on' : ''}`} aria-label={playing ? `Stop ${s.title}` : `Play ${s.title}`} onClick={() => togglePlay(`song-${s.id}`, s.fileUrl)}><Icon name={playing ? 'pause' : 'play'} size={14} /></button>}
          </li>
        );
      })}
    </ol>
  );
}

function DayDetail({ date, info, me, p, songById, playId, togglePlay, editEvent, removeEvent, openSetlist }) {
  const mine = info.session?.records?.[me.id];
  const empty = !info.events.length && !info.setlist && !info.psalm && !info.birthdays.length && !info.session;
  return (
    <div className="stack sm-gap">
      {info.events.map((e) => (
        <div key={e.id} className="cal-ev" style={{ borderLeftColor: EVENT_TYPES[e.type]?.color }}>
          <div className="cal-ev-top">
            <b>{e.title}</b>
            <span className="chip sm" style={{ color: EVENT_TYPES[e.type]?.color }}>{EVENT_TYPES[e.type]?.label}</span>
          </div>
          <div className="muted small">{[e.start && `${e.start}${e.end ? `–${e.end}` : ''}`, e.place].filter(Boolean).join(' · ') || 'Time to be confirmed'}{e.seriesId && ' · every week'}</div>
          {e.notes && <p className="small cal-ev-notes">{e.notes}</p>}
          {p.events && <div className="cal-ev-act"><button className="btn btn-sm btn-ghost" onClick={() => editEvent(e)}><Icon name="edit" size={12} /> Change</button><button className="btn btn-sm btn-ghost" onClick={() => removeEvent(e)}><Icon name="trash" size={12} /> Remove</button></div>}
        </div>
      ))}
      {info.psalm && (
        <div className="cal-box psalm"><Icon name="mic" size={14} /><span><b>Psalmist</b>{info.psalm.title ? ` · ${info.psalm.title}` : ''}<br />{info.psalm.people.map((q) => (q.id === me.id ? `${q.name} (you)` : q.name)).join(', ') || 'To be named'}</span></div>
      )}
      {info.setlist ? (
        <div className="cal-box song">
          <div className="cal-box-h"><Icon name="music" size={14} /><b>Songs{info.setlist.title ? `: ${info.setlist.title}` : ''}</b>{!info.setlist.published && <span className="chip sm warn">Draft: only planners see it</span>}
            {p.setlists && <button className="btn btn-sm btn-ghost" onClick={() => openSetlist(date)}><Icon name="edit" size={12} /> Edit</button>}</div>
          <SetlistSongs setlist={info.setlist} songById={songById} me={me} playId={playId} togglePlay={togglePlay} />
          {info.setlist.notes && <p className="small muted" style={{ margin: '6px 0 0' }}>{info.setlist.notes}</p>}
        </div>
      ) : p.setlists && <button className="btn btn-sm btn-soft cal-plan" onClick={() => openSetlist(date)}><Icon name="music" size={13} /> Plan songs for this day</button>}
      {info.birthdays.length > 0 && <div className="cal-box bday"><span>🎂</span><span><b>Birthday</b><br />{info.birthdays.map((u) => u.name).join(', ')}</span></div>}
      {info.session && participates(me) && (
        <div className={`cal-box att ${mine || 'none'}`}><Icon name="check" size={14} /><span><b>{info.session.title}</b><br />You: {mine ? mine[0].toUpperCase() + mine.slice(1) : 'not marked'}</span></div>
      )}
      {empty && <p className="muted small">Nothing on this day.</p>}
    </div>
  );
}

/* ---------- Adding or changing an event ---------- */
function EventForm({ form, set, busy, save, close }) {
  const f = (k) => (e) => set((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const ok = form.title.trim() && form.date && !(form.start && form.end && form.end <= form.start);
  return (<>
    <div className="field"><label className="label" htmlFor="ev-title">What</label><input id="ev-title" className="input" maxLength={100} value={form.title} onChange={f('title')} placeholder="e.g. Choir rehearsal, Sunday Mass, General meeting" /></div>
    <div className="field"><label className="label">Type</label><div className="chip-row wrap">{Object.entries(EVENT_TYPES).map(([k, t]) => <button type="button" key={k} className={`chip ${form.type === k ? 'on' : ''}`} onClick={() => set((x) => ({ ...x, type: k }))}>{t.label}</button>)}</div></div>
    <div className="grid g3 cal-times">
      <div className="field"><label className="label" htmlFor="ev-date">Date</label><input id="ev-date" type="date" className="input" value={form.date} disabled={!!form.id && form.series} onChange={f('date')} /></div>
      <div className="field"><label className="label" htmlFor="ev-start">Starts</label><input id="ev-start" type="time" className="input" value={form.start} onChange={f('start')} /></div>
      <div className="field"><label className="label" htmlFor="ev-end">Ends</label><input id="ev-end" type="time" className="input" value={form.end} onChange={f('end')} /></div>
    </div>
    {form.start && form.end && form.end <= form.start && <p className="small warn-text">The end time must be after the start.</p>}
    <div className="field"><label className="label" htmlFor="ev-place">Where</label><input id="ev-place" className="input" maxLength={120} value={form.place} onChange={f('place')} placeholder="e.g. Parish hall" /></div>
    <div className="field"><label className="label" htmlFor="ev-notes">Notes</label><textarea id="ev-notes" className="input" rows={2} maxLength={1000} value={form.notes} onChange={f('notes')} placeholder="Anything members should know or bring" /></div>
    {!form.id && (
      <label className="el-pick"><input type="checkbox" checked={form.repeat} onChange={f('repeat')} /><span>Every week, for <input type="number" className="input sm cal-weeks" min={2} max={52} value={form.weeks} onClick={(e) => e.preventDefault()} onChange={(e) => set((x) => ({ ...x, repeat: true, weeks: Math.max(2, Math.min(52, +e.target.value || 2)) }))} /> weeks</span></label>
    )}
    {form.id && form.seriesId && <label className="el-pick"><input type="checkbox" checked={!!form.series} onChange={f('series')} /><span>Also change the later weeks of this repeating event</span></label>}
    <div className="modal-foot"><button className="btn btn-ghost" onClick={close}>Cancel</button><button className="btn btn-pri" disabled={busy || !ok} onClick={() => save(form)}>{busy ? 'Saving…' : form.id ? 'Save changes' : 'Add event'}</button></div>
  </>);
}

/* ---------- Planning the songs for a day ---------- */
function SetlistForm({ form, set, songs, busy, save, remove, close }) {
  const sorted = useMemo(() => [...songs].sort((a, b) => a.title.localeCompare(b.title)), [songs]);
  const item = (n, k, v) => set((x) => ({ ...x, items: x.items.map((i, j) => (j === n ? { ...i, [k]: v } : i)) }));
  const moveItem = (n, d) => set((x) => { const items = [...x.items]; const [it] = items.splice(n, 1); items.splice(n + d, 0, it); return { ...x, items }; });
  const count = form.items.filter((i) => i.songId).length;
  return (<>
    <div className="field"><label className="label" htmlFor="sl-title">Occasion (optional)</label><input id="sl-title" className="input" maxLength={100} value={form.title} onChange={(e) => set((x) => ({ ...x, title: e.target.value }))} placeholder="e.g. First Sunday of Advent" /></div>
    {!songs.length && <p className="small warn-text">The Music Library is empty. Upload the songs there first.</p>}
    <datalist id="mass-parts">{PARTS_OF_MASS.map((m) => <option key={m} value={m} />)}</datalist>
    <ol className="sl-items">
      {form.items.map((i, n) => (
        <li key={n} className="sl-item">
          <span className="sl-n">{n + 1}</span>
          <div className="sl-fields">
            <input className="input sm" list="mass-parts" maxLength={40} value={i.label} placeholder="Part of the Mass" aria-label={`Part for song ${n + 1}`} onChange={(e) => item(n, 'label', e.target.value)} />
            <select className="input sm" value={i.songId} aria-label={`Song ${n + 1}`} onChange={(e) => item(n, 'songId', e.target.value)}>
              <option value="">Choose a song…</option>
              {sorted.map((s) => <option key={s.id} value={s.id}>{s.title}{s.part ? ` · ${s.part}` : ''}</option>)}
            </select>
            <input className="input sm" maxLength={200} value={i.note} placeholder="Note (optional), e.g. verses 1 & 3" aria-label={`Note for song ${n + 1}`} onChange={(e) => item(n, 'note', e.target.value)} />
          </div>
          <div className="sl-act">
            <button className="icon-btn" disabled={n === 0} aria-label="Move up" onClick={() => moveItem(n, -1)}><Icon name="chevron-up" size={13} /></button>
            <button className="icon-btn" disabled={n === form.items.length - 1} aria-label="Move down" onClick={() => moveItem(n, 1)}><Icon name="chevron-down" size={13} /></button>
            <button className="icon-btn" aria-label="Remove song" onClick={() => set((x) => ({ ...x, items: x.items.filter((_, j) => j !== n) }))}><Icon name="x" size={13} /></button>
          </div>
        </li>
      ))}
    </ol>
    <button className="btn btn-sm btn-soft" disabled={form.items.length >= 40} onClick={() => set((x) => ({ ...x, items: [...x.items, { songId: '', label: '', note: '' }] }))}><Icon name="plus" size={12} /> Add a song</button>
    <div className="field" style={{ marginTop: 12 }}><label className="label" htmlFor="sl-notes">Notes for the choir (optional)</label><textarea id="sl-notes" className="input" rows={2} maxLength={1000} value={form.notes} onChange={(e) => set((x) => ({ ...x, notes: e.target.value }))} placeholder="e.g. Sopranos take the descant in the Gloria" /></div>
    <div className="modal-foot sl-foot">
      {form.exists && <button className="btn btn-sm btn-danger-soft" disabled={busy} onClick={remove}><Icon name="trash" size={12} /> Delete</button>}
      <span style={{ flex: 1 }} />
      <button className="btn btn-ghost" onClick={close}>Cancel</button>
      <button className="btn btn-soft" disabled={busy} onClick={() => save(form, false)}>{form.wasPublished ? 'Unpublish' : 'Save draft'}</button>
      <button className="btn btn-pri" disabled={busy || !count} onClick={() => save(form, true)}>{busy ? 'Saving…' : form.wasPublished ? 'Save changes' : 'Publish to members'}</button>
    </div>
  </>);
}
