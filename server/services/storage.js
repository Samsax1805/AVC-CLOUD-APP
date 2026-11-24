const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const {
  S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand,
  CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Where files live. On the website: the choir's private S3 bucket. The browser uploads and downloads
// directly with short-lived signed links, so files never pass through this server.
// For LOCAL TESTING ONLY (never in production): FILES_LOCAL_DIR keeps files in a folder on this computer
// and imitates S3's signed links, ETags and multipart uploads, so tests never touch the real storage.
const LINK_SECONDS = 15 * 60;
const MAX_BYTES = 100 * 1024 * 1024;
const PART_BYTES = 8 * 1024 * 1024; // files above this go up in parts and can resume
const LOCAL = process.env.NODE_ENV !== 'production' && process.env.FILES_LOCAL_DIR ? path.resolve(process.env.FILES_LOCAL_DIR) : null;

let client;
const s3 = () => (client ||= new S3Client({ region: process.env.AWS_REGION || 'eu-north-1' }));
const bucket = () => process.env.S3_BUCKET;
const keyOf = (id) => `files/${id}`;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,8})?$/;

const configured = () => !!(LOCAL || bucket());
const newId = (name) => {
  const ext = (/\.([a-z0-9]{1,8})$/i.exec(String(name || '')) || [])[1];
  return crypto.randomUUID() + (ext ? `.${ext.toLowerCase()}` : '');
};

/* ---------- local stand-in (tests only) ---------- */
const secret = crypto.randomBytes(32);
const sign = (o) => { const b = Buffer.from(JSON.stringify(o)).toString('base64url'); return `${b}.${crypto.createHmac('sha256', secret).update(b).digest('base64url')}`; };
const unsign = (t) => {
  const [b, s] = String(t).split('.');
  if (!b || !s || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(crypto.createHmac('sha256', secret).update(b).digest('base64url')))) return null;
  const o = JSON.parse(Buffer.from(b, 'base64url').toString()); return o.exp > Date.now() ? o : null;
};
const localUrl = (o) => `${process.env.FILES_LOCAL_BASE || 'http://localhost:5000'}/api/files/local/${sign({ ...o, exp: Date.now() + LINK_SECONDS * 1000 })}`;
const lp = (...p) => path.join(LOCAL, ...p);
const metaOf = (id) => { try { return JSON.parse(fs.readFileSync(lp(`${id}.json`), 'utf8')); } catch { return null; } };

/* ---------- the same calls for both ---------- */
// A signed link to upload one whole file
exports.putUrl = async (id, type, size) => (LOCAL
  ? localUrl({ op: 'put', id, type, size })
  : getSignedUrl(s3(), new PutObjectCommand({ Bucket: bucket(), Key: keyOf(id), ContentType: type, ContentLength: size }), { expiresIn: LINK_SECONDS }));

// A signed link to open or download a file
exports.getUrl = async (id, name) => (LOCAL
  ? localUrl({ op: 'get', id, name })
  : getSignedUrl(s3(), new GetObjectCommand({
    Bucket: bucket(), Key: keyOf(id), ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(name || id)}`,
  }), { expiresIn: LINK_SECONDS }));

// Uploads in parts: start, a signed link per part, finish (or give up)
exports.startParts = async (id, type) => {
  if (LOCAL) { const u = crypto.randomUUID(); fs.mkdirSync(lp('.parts', u), { recursive: true }); fs.writeFileSync(lp('.parts', u, 'info.json'), JSON.stringify({ id, type })); return u; }
  return (await s3().send(new CreateMultipartUploadCommand({ Bucket: bucket(), Key: keyOf(id), ContentType: type }))).UploadId;
};
exports.partUrl = async (id, uploadId, n) => (LOCAL
  ? localUrl({ op: 'part', id, u: uploadId, n })
  : getSignedUrl(s3(), new UploadPartCommand({ Bucket: bucket(), Key: keyOf(id), UploadId: uploadId, PartNumber: n }), { expiresIn: LINK_SECONDS }));
exports.finishParts = async (id, uploadId, parts) => {
  const sorted = [...parts].sort((a, b) => a.n - b.n);
  if (LOCAL) {
    const dir = lp('.parts', uploadId);
    const info = JSON.parse(fs.readFileSync(path.join(dir, 'info.json'), 'utf8'));
    if (info.id !== id) throw new Error('Upload does not match');
    const md5s = [];
    const out = fs.openSync(lp(id), 'w');
    for (const p of sorted) {
      const buf = fs.readFileSync(path.join(dir, String(p.n)));
      const m = crypto.createHash('md5').update(buf).digest();
      if (`"${m.toString('hex')}"` !== p.etag) { fs.closeSync(out); throw new Error('A part did not arrive intact'); }
      md5s.push(m); fs.writeSync(out, buf);
    }
    fs.closeSync(out);
    const etag = `"${crypto.createHash('md5').update(Buffer.concat(md5s)).digest('hex')}-${sorted.length}"`;
    fs.writeFileSync(lp(`${id}.json`), JSON.stringify({ type: info.type, size: fs.statSync(lp(id)).size, etag }));
    fs.rmSync(dir, { recursive: true, force: true });
    return;
  }
  await s3().send(new CompleteMultipartUploadCommand({
    Bucket: bucket(), Key: keyOf(id), UploadId: uploadId,
    MultipartUpload: { Parts: sorted.map((p) => ({ PartNumber: p.n, ETag: p.etag })) },
  }));
};
exports.abortParts = async (id, uploadId) => {
  if (LOCAL) return fs.rmSync(lp('.parts', String(uploadId).replace(/[^0-9a-f-]/g, '')), { recursive: true, force: true });
  return s3().send(new AbortMultipartUploadCommand({ Bucket: bucket(), Key: keyOf(id), UploadId: uploadId })).catch(() => {});
};

// Is the file really there? Its size and the fingerprint (ETag) the storage service made for it
exports.head = async (id) => {
  if (LOCAL) { const m = metaOf(id); return m && fs.existsSync(lp(id)) ? { size: m.size, etag: m.etag, type: m.type } : null; }
  try {
    const r = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: keyOf(id) }));
    return { size: r.ContentLength, etag: r.ETag, type: r.ContentType };
  } catch (e) {
    if (e.$metadata?.httpStatusCode === 404 || e.name === 'NotFound') return null;
    throw e;
  }
};

exports.remove = async (id) => {
  if (LOCAL) { fs.rmSync(lp(id), { force: true }); fs.rmSync(lp(`${id}.json`), { force: true }); return; }
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: keyOf(id) })).catch(() => {});
};

// The local stand-in's own upload / download address (mounted only when FILES_LOCAL_DIR is set)
exports.localRouter = () => {
  if (!LOCAL) return null;
  fs.mkdirSync(lp('.parts'), { recursive: true });
  const r = express.Router();
  r.put('/:token', (req, res) => {
    const o = unsign(req.params.token);
    if (!o || (o.op !== 'put' && o.op !== 'part') || !ID.test(o.id)) return res.status(403).end();
    const target = o.op === 'put' ? lp(o.id) : lp('.parts', o.u, String(o.n));
    if (o.op === 'part' && !fs.existsSync(lp('.parts', o.u))) return res.status(404).end();
    const hash = crypto.createHash('md5');
    const out = fs.createWriteStream(target);
    let bytes = 0; let failed = false;
    req.on('data', (c) => { bytes += c.length; if (bytes > MAX_BYTES) { failed = true; req.destroy(); } hash.update(c); });
    req.on('aborted', () => { failed = true; });
    req.pipe(out);
    out.on('finish', () => {
      if (failed) { fs.rmSync(target, { force: true }); return; }
      const etag = `"${hash.digest('hex')}"`;
      if (o.op === 'put') fs.writeFileSync(lp(`${o.id}.json`), JSON.stringify({ type: o.type, size: bytes, etag }));
      res.set({ ETag: etag, 'Access-Control-Expose-Headers': 'ETag' }).status(200).end();
    });
  });
  r.get('/:token', (req, res) => {
    const o = unsign(req.params.token);
    if (!o || o.op !== 'get' || !ID.test(o.id) || !fs.existsSync(lp(o.id))) return res.status(404).end();
    const m = metaOf(o.id) || {};
    res.set({ 'Content-Type': m.type || 'application/octet-stream', 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(o.name || o.id)}` });
    fs.createReadStream(lp(o.id)).pipe(res);
  });
  return r;
};

Object.assign(exports, { configured, newId, ID, MAX_BYTES, PART_BYTES, LINK_SECONDS, LOCAL: !!LOCAL });
