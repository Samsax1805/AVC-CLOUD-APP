import { useCallback, useEffect, useRef, useState } from 'react';
import { saveField } from '../services/library';

// Saves each detail on its own about a second after typing stops (no Save button).
// - Unsent changes are kept on this device: offline, they wait and go as soon as the connection returns;
//   closing the page warns first, and anything left is sent the next time the item is opened here.
// - If someone else changed the same field meanwhile, nothing is overwritten: the field shows their value
//   and asks "Keep theirs" or "Use mine".
const TYPING_MS = 900;
const store = (uid) => `lib-pend:${uid}`;
const readPending = (uid) => { try { return JSON.parse(localStorage.getItem(store(uid)) || '{}'); } catch { return {}; } };
const writePending = (uid, p) => { try { if (Object.keys(p).length) localStorage.setItem(store(uid), JSON.stringify(p)); else localStorage.removeItem(store(uid)); } catch { /* blocked storage: changes still send while the page is open */ } };

export default function useAutosave(item, onSaved) {
  const uid = item?.uid;
  const [values, setValues] = useState(item?.d || {});
  const revs = useRef({});
  const pending = useRef({}); // field → value waiting to be sent
  const timers = useRef({});
  const inFlight = useRef({});
  const [conflicts, setConflictsState] = useState({}); // field → { value, r, byName, at }
  const conflictsRef = useRef({});
  const setConflicts = (fn) => setConflictsState((c) => { const n = typeof fn === 'function' ? fn(c) : fn; conflictsRef.current = n; return n; });
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ saving: 0, waiting: 0, savedAt: null, offline: !navigator.onLine, locked: false });
  const savedCb = useRef(onSaved); savedCb.current = onSaved;

  const count = () => setState((s) => ({ ...s, waiting: Object.keys(pending.current).length, saving: Object.keys(inFlight.current).length }));

  // A fresh copy of the item from the server (opening it, or after a file change): keep what is still unsent here
  useEffect(() => {
    if (!item) return;
    revs.current = Object.fromEntries(Object.entries(item.meta || {}).map(([k, m]) => [k, m.r || 0]));
    setValues({ ...(item.d || {}), ...pending.current });
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(async (field) => {
    if (!uid || !(field in pending.current) || inFlight.current[field] || conflictsRef.current[field]) return;
    if (!navigator.onLine) { setState((s) => ({ ...s, offline: true })); return; }
    const value = pending.current[field];
    inFlight.current[field] = true; count();
    try {
      const r = await saveField(uid, field, value, revs.current[field] || 0);
      revs.current[field] = r.r;
      // Changed again while this was on its way? Keep the newer value waiting; otherwise it's saved
      if (JSON.stringify(pending.current[field]) === JSON.stringify(value)) delete pending.current[field];
      writePending(uid, pending.current);
      setErrors((e) => { const { [field]: _, ...rest } = e; return rest; });
      // The server's spelling (e.g. a list's official capitals) replaces mine, but never just for spaces, which would jump the cursor
      const norm = (x) => JSON.stringify(typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : x);
      if (norm(r.value) !== norm(value) && !(field in pending.current)) setValues((v) => ({ ...v, [field]: r.value }));
      setState((s) => ({ ...s, savedAt: new Date(), offline: false }));
      savedCb.current?.(r);
    } catch (e) {
      const d = e.response?.data;
      if (e.response?.status === 409 && d?.code === 'CONFLICT') { conflictsRef.current = { ...conflictsRef.current, [field]: d }; setConflicts((c) => ({ ...c, [field]: d })); }
      else if (e.response?.status === 409 && d?.code === 'LOCKED') { setState((s) => ({ ...s, locked: true })); }
      else if (e.response) { delete pending.current[field]; writePending(uid, pending.current); setErrors((x) => ({ ...x, [field]: d?.msg || 'Not saved' })); }
      else setState((s) => ({ ...s, offline: !navigator.onLine })); // no answer: stays waiting, tried again shortly
    } finally {
      delete inFlight.current[field]; count();
      if (field in pending.current && !conflictsRef.current[field]) timers.current[field] = setTimeout(() => send(field), navigator.onLine ? 4000 : 1000);
    }
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = useCallback((field, value, { now = false } = {}) => {
    setValues((v) => ({ ...v, [field]: value }));
    pending.current[field] = value;
    writePending(uid, pending.current);
    count();
    clearTimeout(timers.current[field]);
    timers.current[field] = setTimeout(() => send(field), now ? 0 : TYPING_MS);
  }, [uid, send]);

  // Keep theirs: take the other person's value. Use mine: save mine on top of their latest revision.
  const resolve = useCallback((field, choice) => {
    const c = conflicts[field]; if (!c) return;
    revs.current[field] = c.r;
    conflictsRef.current = Object.fromEntries(Object.entries(conflictsRef.current).filter(([k]) => k !== field));
    setConflicts((x) => { const { [field]: _, ...rest } = x; return rest; });
    if (choice === 'theirs') {
      delete pending.current[field]; writePending(uid, pending.current); count();
      setValues((v) => ({ ...v, [field]: c.value }));
    } else setTimeout(() => send(field), 0);
  }, [conflicts, uid, send]);

  // Back online, or reopened with changes left from last time: send them
  useEffect(() => {
    if (!uid) return undefined;
    const left = readPending(uid);
    Object.assign(pending.current, left);
    if (Object.keys(left).length) { setValues((v) => ({ ...v, ...left })); Object.keys(left).forEach((f) => setTimeout(() => send(f), 300)); }
    count();
    const up = () => { setState((s) => ({ ...s, offline: false })); Object.keys(pending.current).forEach((f) => send(f)); };
    const down = () => setState((s) => ({ ...s, offline: true }));
    const leaving = (e) => { if (Object.keys(pending.current).length) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('online', up); window.addEventListener('offline', down); window.addEventListener('beforeunload', leaving);
    return () => {
      window.removeEventListener('online', up); window.removeEventListener('offline', down); window.removeEventListener('beforeunload', leaving);
      // Closing the editor: send what is waiting straight away (it also stays saved on this device until sent)
      Object.values(timers.current).forEach(clearTimeout);
      Object.keys(pending.current).forEach((f) => { if (navigator.onLine) saveField(uid, f, pending.current[f], revs.current[f] || 0).then(() => { const p = readPending(uid); delete p[f]; writePending(uid, p); }).catch(() => {}); });
    };
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  return { values, set, conflicts, resolve, errors, state };
}
