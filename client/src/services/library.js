import api from './api';

// Choir Music & Instrument Library: the upload queue (stage A).
// Files go straight from this device to the choir's storage, never through our server. Big files go up in
// 8 MB parts; a dropped connection only pauses the upload, which carries on from the last part sent.

export const MAX_MB = 100;
export const ACCEPT = 'application/pdf,image/*,audio/*,video/*,.musicxml,.mxl,.xml,.mscz,.mscx,.mid,.midi';

let listsCache;
export const loadLists = () => (listsCache ||= api.get('/library/lists').then(({ data }) => data).catch((e) => { listsCache = null; throw e; }));
export const forgetLists = () => { listsCache = null; };

export const listItems = (params) => api.get('/library/items', { params }).then(({ data }) => data);
export const getItem = (uid) => api.get(`/library/items/${uid}`).then(({ data }) => data.item);
export const saveField = (uid, field, value, base) => api.patch(`/library/items/${uid}`, { field, value, base }).then(({ data }) => data);
export const changeFile = (uid, fid, change) => api.patch(`/library/items/${uid}/files/${fid}`, change).then(({ data }) => data.item);
export const removeFile = (uid, fid) => api.delete(`/library/items/${uid}/files/${fid}`).then(({ data }) => data.item);
export const claimItem = (uid, on = true) => api.post(`/library/items/${uid}/claim`, { on }).then(({ data }) => data.item);
export const sendPresence = (uid, body) => api.post(`/library/items/${uid}/presence`, body).then(({ data }) => data.here || []);
export const settleDuplicate = (uid, action) => api.post(`/library/items/${uid}/duplicate`, { action }).then(({ data }) => data);
export const removeItem = (uid) => api.delete(`/library/items/${uid}`);
export const problem = (e, fallback = 'Something went wrong — please try again') => e?.response?.data?.msg || e?.message || fallback;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const online = () => (navigator.onLine ? Promise.resolve() : new Promise((r) => window.addEventListener('online', r, { once: true })));
const offlineError = (e) => !e?.response; // no answer at all: the connection, not a refusal

// Keeps trying while the connection is down (waiting for it to return), with growing pauses
const persist = async (fn, { tries = 8, onWait, signal } = {}) => {
  for (let i = 0; ; i++) {
    if (signal?.aborted) throw new Error('Stopped');
    try { return await fn(); } catch (e) {
      if (signal?.aborted || i >= tries - 1 || !(offlineError(e) || e.retry)) throw e;
      onWait?.(navigator.onLine ? 'retrying' : 'offline');
      await online();
      await sleep(Math.min(30000, 1000 * 2 ** i));
    }
  }
};

// PUT with upload progress (fetch can't report it)
const put = (url, body, headers, onProgress, signal) => new Promise((resolve, reject) => {
  const x = new XMLHttpRequest();
  x.open('PUT', url);
  Object.entries(headers || {}).forEach(([k, v]) => x.setRequestHeader(k, v));
  x.upload.onprogress = (e) => onProgress?.(e.loaded);
  x.onload = () => {
    if (x.status >= 200 && x.status < 300) resolve(x.getResponseHeader('ETag'));
    else reject(Object.assign(new Error(`Storage answered ${x.status}`), { status: x.status, retry: x.status >= 500 || x.status === 403 }));
  };
  x.onerror = () => reject(new Error('Connection lost'));
  x.onabort = () => reject(new Error('Stopped'));
  signal?.addEventListener('abort', () => x.abort(), { once: true });
  x.send(body);
});

// Remembers a part-way upload, so picking the same file again (even after closing the page) carries on
const resumeKey = (f) => `lib-up:${f.name}|${f.size}|${f.lastModified}`;
const readResume = (f) => { try { const r = JSON.parse(localStorage.getItem(resumeKey(f)) || 'null'); return r && Date.now() - r.at < 24 * 3600 * 1000 ? r : null; } catch { return null; } };
const writeResume = (f, r) => { try { localStorage.setItem(resumeKey(f), JSON.stringify({ ...r, urls: undefined, url: undefined, at: Date.now() })); } catch { /* storage full or blocked: resuming within this visit still works */ } };
const dropResume = (f) => { try { localStorage.removeItem(resumeKey(f)); } catch { /* ignore */ } };

// Uploads one file. Returns what the server needs to record it: { id, uploadId?, parts?, name, type }.
// onState({ sent, total, phase: 'uploading' | 'offline' | 'retrying' })
export const uploadToLibrary = async (file, { onState, signal } = {}) => {
  if (file.size > MAX_MB * 1048576) throw new Error(`"${file.name}" is larger than ${MAX_MB} MB`);
  const total = file.size;
  const tell = (sent, phase = 'uploading') => onState?.({ sent, total, phase });
  const wait = (phase) => tell(undefined, phase);
  let slot = readResume(file);
  const resumed = !!slot;
  if (!slot) {
    try { ({ data: slot } = await persist(() => api.post('/library/uploads', { name: file.name, type: file.type, size: file.size }), { onWait: wait, signal })); } catch (e) { throw new Error(problem(e, 'Upload failed')); }
  }
  if (!slot.uploadId) {
    if (resumed) { dropResume(file); return uploadToLibrary(file, { onState, signal }); } // whole-file links can't be resumed
    await persist(() => put(slot.url, file, slot.headers, (n) => tell(n), signal), { onWait: wait, signal }).catch((e) => { throw new Error(e.message === 'Stopped' ? 'Stopped' : 'Upload failed — check your connection and try again'); });
    tell(total);
    return { id: slot.id, name: file.name, type: slot.type };
  }
  // In parts: send each part not yet sent; links last 15 minutes, so ask for fresh ones when resuming
  const count = Math.ceil(total / slot.partSize);
  const done = slot.done || {};
  writeResume(file, { ...slot, done });
  let urls = !resumed && Array.isArray(slot.urls) ? Object.fromEntries(slot.urls.map((u, i) => [i + 1, u])) : null;
  for (let n = 1; n <= count; n++) {
    if (done[n]) continue;
    const from = (n - 1) * slot.partSize;
    const body = file.slice(from, Math.min(total, from + slot.partSize));
    const sentBefore = Object.keys(done).reduce((a, k) => a + Math.min(slot.partSize, total - (k - 1) * slot.partSize), 0);
    done[n] = await persist(async () => {
      if (!urls || !urls[n]) {
        const missing = Array.from({ length: count }, (_, i) => i + 1).filter((k) => !done[k]);
        const { data } = await api.post('/library/uploads/parts', { id: slot.id, uploadId: slot.uploadId, parts: missing });
        urls = data.urls;
      }
      try { return await put(urls[n], body, {}, (b) => tell(sentBefore + b), signal); } catch (e) { if (e.status === 403) urls = null; throw e; }
    }, { onWait: wait, signal, tries: 12 }).catch((e) => { throw new Error(e.message === 'Stopped' ? 'Stopped' : 'Upload paused — pick the same file again to carry on'); });
    writeResume(file, { ...slot, done });
  }
  tell(total);
  return { id: slot.id, uploadId: slot.uploadId, parts: Object.entries(done).map(([n, etag]) => ({ n: Number(n), etag })), name: file.name, type: slot.type, finish: () => dropResume(file) };
};

// Records an uploaded file (or a link) as a new queue item. Retried with the same key until it is saved,
// so a dropped connection can never lose the upload or make two items.
export const createItem = async (body, { onWait, signal } = {}) => {
  const key = body.key || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const { finish, ...upload } = body.upload || {};
  const { data } = await persist(() => api.post('/library/items', { ...body, ...(body.upload ? { upload } : {}), key }), { onWait, signal, tries: 20 });
  finish?.();
  return data.item;
};

export const addFileTo = async (uid, body, { onWait } = {}) => {
  const { finish, ...upload } = body.upload || {};
  const { data } = await persist(() => api.post(`/library/items/${uid}/files`, { ...body, ...(body.upload ? { upload } : {}) }), { onWait, tries: 20 });
  finish?.();
  return data.item;
};

export const sizeLabel = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// Stage B: who may do what, approval, publishing, urgent publishing, Music Approvers, the catalogue
export const libraryMe = () => api.get('/library/me').then(({ data }) => data);
export const sendItem = (uid) => api.post(`/library/items/${uid}/send`).then(({ data }) => data.item);
export const sendBackItem = (uid, reason) => api.post(`/library/items/${uid}/sendback`, { reason }).then(({ data }) => data.item);
export const approveItem = (uid, body) => api.post(`/library/items/${uid}/approve`, body).then(({ data }) => data.item);
export const publishItem = (uid) => api.post(`/library/items/${uid}/publish`).then(({ data }) => data.item);
export const urgentItem = (uid, reason) => api.post(`/library/items/${uid}/urgent`, { reason }).then(({ data }) => data.item);
export const nextCode = (type) => api.get('/library/next', { params: { type } }).then(({ data }) => data.code);
export const heldItems = () => api.get('/library/held').then(({ data }) => data.items);
export const listApprovers = () => api.get('/library/approvers').then(({ data }) => data);
export const addApprover = (userId) => api.post('/library/approvers', { userId }).then(({ data }) => data);
export const removeApprover = (userId) => api.delete(`/library/approvers/${userId}`).then(({ data }) => data);
export const catalogue = (params) => api.get('/library/catalogue', { params }).then(({ data }) => data);
export const catalogueSong = (uid) => api.get(`/library/catalogue/${uid}`).then(({ data }) => data.song);
