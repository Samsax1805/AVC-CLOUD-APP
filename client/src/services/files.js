import api from './api';

export const MAX_UPLOAD_MB = 25;

// Uploads a File/Blob to the server's file store; returns { id, name, size, type }
export const uploadFile = async (file, name = file.name || 'file') => {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) throw new Error(`File is larger than ${MAX_UPLOAD_MB} MB`);
  try {
    const { data } = await api.post('/files', file, {
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(name) },
    });
    return data;
  } catch (e) {
    throw new Error(e.response?.data?.msg || 'Upload failed');
  }
};

// Files need the sign-in token, so they are fetched once and played/opened from a local blob URL
const cache = new Map();
export const fileUrl = async (id) => {
  if (!cache.has(id)) {
    cache.set(id, api.get(`/files/${id}`, { responseType: 'blob' })
      .then(({ data }) => URL.createObjectURL(data))
      .catch((e) => { cache.delete(id); throw new Error(e.response?.status === 404 ? 'File not found' : 'Could not load file'); }));
  }
  return cache.get(id);
};

export const openFile = async (id, name) => {
  const url = await fileUrl(id);
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  if (name) a.download = name;
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
