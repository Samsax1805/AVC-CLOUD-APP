import api from './api';

export const MAX_UPLOAD_MB = 100;

// Some browsers leave the type of Word/Excel/PowerPoint files blank: work it out from the name
const TYPE_BY_EXT = {
  pdf: 'application/pdf', doc: 'application/msword', xls: 'application/vnd.ms-excel', ppt: 'application/vnd.ms-powerpoint',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
export const DOC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*';
export const sizeOf = (bytes) => (bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB');

// Files live in private S3 storage. The server hands out short-lived signed links and
// the browser uploads/downloads directly, so big files never pass through our server.
// Returns { id, name, size, type }
export const uploadFile = async (file, name = file.name || 'file') => {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) throw new Error(`File is larger than ${MAX_UPLOAD_MB} MB`);
  const type = file.type || TYPE_BY_EXT[(/\.([a-z0-9]+)$/i.exec(name) || [])[1]?.toLowerCase()] || 'application/octet-stream';
  let slot;
  try {
    ({ data: slot } = await api.post('/files/upload-url', { name, type, size: file.size }));
  } catch (e) {
    throw new Error(e.response?.data?.msg || 'Upload failed');
  }
  const res = await fetch(slot.uploadUrl, { method: 'PUT', headers: slot.headers, body: file }).catch(() => null);
  if (!res || !res.ok) throw new Error('Upload failed — check your connection and try again');
  return { id: slot.id, name: slot.name, size: slot.size, type: slot.type };
};

// Older files (MongoDB ids) need the sign-in token, so they are fetched once into a local blob URL.
// S3 files get a signed link, re-used until shortly before it expires.
const isLegacy = (id) => /^[0-9a-f]{24}$/.test(id);
const cache = new Map();
export const fileUrl = async (id, name) => {
  const hit = cache.get(id);
  if (hit && (!hit.expires || hit.expires > Date.now())) return hit.url;
  const url = isLegacy(id)
    ? api.get(`/files/${id}`, { responseType: 'blob' }).then(({ data }) => URL.createObjectURL(data))
    : api.get(`/files/${id}/url`, { params: { name } }).then(({ data }) => data.url);
  const entry = { url: url.catch((e) => { cache.delete(id); throw new Error(e.response?.status === 404 ? 'File not found' : 'Could not load file'); }) };
  if (!isLegacy(id)) entry.expires = Date.now() + 10 * 60 * 1000;
  cache.set(id, entry);
  return entry.url;
};

// Opening a file never shows the storage address: the file is fetched here and shown from the site's own
// blob: address (blob:https://avcsb.com/…), so the signed storage link never reaches the address bar.
// Where the browser cannot show a file itself (a PDF on most phones, Word/Excel files), it is downloaded
// with its real name instead, which is masked the same way.
const held = new Map(); // id → Promise<{ url, type }>, kept briefly so opening it again is instant
const KEEP_MS = 5 * 60 * 1000;
const fetchHere = (id, name) => {
  if (!held.has(id)) {
    const p = (async () => {
      const src = await fileUrl(id, name);
      const res = await fetch(src).catch(() => null);
      if (!res || !res.ok) throw new Error(res?.status === 404 || res?.status === 403 ? 'File not found' : 'Could not load file — check your connection');
      const blob = await res.blob();
      return { url: src.startsWith('blob:') ? src : URL.createObjectURL(blob), type: blob.type || '' };
    })();
    held.set(id, p.catch((e) => { held.delete(id); throw e; }));
    setTimeout(() => { const h = held.get(id); held.delete(id); h?.then((x) => !isLegacy(id) && setTimeout(() => URL.revokeObjectURL(x.url), 60000)).catch(() => {}); }, KEEP_MS);
  }
  return held.get(id);
};
// The file itself (as a blob: address on this site), for the score viewer
export const fileHere = (id, name) => fetchHere(id, name);
const shownHere = (type, name) => {
  const t = type || '';
  if (t === 'application/pdf' || /\.pdf$/i.test(name || '')) return navigator.pdfViewerEnabled !== false;
  return /^(image|audio|video|text)\//.test(t);
};
const esc = (s) => String(s || 'file').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const openFile = async (id, name) => {
  // The tab opens at the tap itself (so pop-up blockers allow it) and shows "Opening…" while the file arrives
  const win = window.open('', '_blank');
  try {
    if (win) {
      win.opener = null;
      win.document.title = name || 'File';
      win.document.body.innerHTML = `<p style="font:15px system-ui,sans-serif;color:#22315f;padding:24px">Opening ${esc(name)}…</p>`;
    }
    const { url, type } = await fetchHere(id, name);
    if (win && shownHere(type, name)) { win.location.replace(url); return; }
    win?.close();
    const a = document.createElement('a');
    a.href = url; a.download = name || 'file';
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e) {
    win?.close();
    throw e;
  }
};

export const deleteFile = (id) => (id ? api.delete(`/files/${id}`).catch(() => {}) : Promise.resolve());

// Reads an audio/video file's length in seconds (0 if unknown)
export const mediaDuration = (file) => new Promise((resolve) => {
  const el = document.createElement(file.type.startsWith('video') ? 'video' : 'audio');
  const url = URL.createObjectURL(file);
  const done = (d) => { URL.revokeObjectURL(url); resolve(Number.isFinite(d) ? d : 0); };
  el.preload = 'metadata';
  el.onloadedmetadata = () => done(el.duration);
  el.onerror = () => done(0);
  el.src = url;
});

// Small JPEG preview: first page of a PDF, or a scaled-down image. Returns a data URL or ''.
export const makePreview = async (file, width = 360) => {
  try {
    let source;
    if (file.type === 'application/pdf') {
      const pdfjs = await import('pdfjs-dist');
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      // (version 6 of the PDF reader closes a document through its loading task; pdf.destroy() no longer exists)
      const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
      const pdf = await task.promise;
      const page = await pdf.getPage(1);
      const vp = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / vp.width });
      source = document.createElement('canvas');
      source.width = viewport.width; source.height = viewport.height;
      await page.render({ canvasContext: source.getContext('2d'), viewport }).promise;
      task.destroy().catch(() => {});
    } else if (file.type.startsWith('image/')) {
      source = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img); img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
    } else return '';
    const scale = Math.min(1, width / source.width);
    const out = document.createElement('canvas');
    out.width = Math.round(source.width * scale); out.height = Math.round(source.height * scale);
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(source, 0, 0, out.width, out.height);
    return out.toDataURL('image/jpeg', 0.72);
  } catch (e) {
    console.warn('No preview could be made:', e?.message || e);
    return '';
  }
};

// A first-page picture for a file already stored (used to fill in pictures that are missing)
export const previewFromStored = async (id, name, type) => {
  const src = await fileUrl(id, name);
  const res = await fetch(src);
  if (!res.ok) return '';
  const blob = await res.blob();
  return makePreview(new File([blob], name || 'file', { type: type || blob.type }));
};
