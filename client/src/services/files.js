import api from './api';

export const MAX_UPLOAD_MB = 100;

// Files live in private S3 storage. The server hands out short-lived signed links and
// the browser uploads/downloads directly, so big files never pass through our server.
// Returns { id, name, size, type }
export const uploadFile = async (file, name = file.name || 'file') => {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) throw new Error(`File is larger than ${MAX_UPLOAD_MB} MB`);
  const type = file.type || 'application/octet-stream';
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

export const openFile = async (id, name) => {
  const url = await fileUrl(id, name);
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  if (name && isLegacy(id)) a.download = name;
  a.click();
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
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      const page = await pdf.getPage(1);
      const vp = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / vp.width });
      source = document.createElement('canvas');
      source.width = viewport.width; source.height = viewport.height;
      await page.render({ canvasContext: source.getContext('2d'), viewport }).promise;
      pdf.destroy();
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
  } catch {
    return '';
  }
};
