const mongoose = require('mongoose');

// Files live in MongoDB itself (GridFS bucket "uploads"), so no extra storage service is needed.
// Free Atlas clusters hold 512 MB in total, hence the per-file cap.
const MAX_BYTES = 25 * 1024 * 1024;
const UPLOADERS = ['admin', 'president', 'custodian'];
const ALLOWED = /^(audio\/|image\/|video\/|application\/pdf$)/;

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
const canUpload = (req) => (req.user.roles || []).some((r) => UPLOADERS.includes(r)) && !(req.user.roles || []).includes('alumni');

// POST /api/files — raw body; Content-Type = the file's type, X-File-Name = its name
exports.upload = async (req, res) => {
  if (!canUpload(req)) return res.status(403).json({ msg: 'Only the Custodian, President or an admin can upload files' });
  const type = (req.headers['content-type'] || '').split(';')[0].trim();
  if (!ALLOWED.test(type)) return res.status(415).json({ msg: 'Only audio, video, image or PDF files can be uploaded' });
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ msg: 'Empty file' });
  const name = decodeURIComponent(req.headers['x-file-name'] || 'file').slice(0, 200);
  const stream = bucket().openUploadStream(name, { metadata: { contentType: type, by: req.user.id } });
  stream.on('error', (e) => res.status(500).json({ msg: 'Upload failed', detail: e.message }));
  stream.on('finish', () => res.json({ id: stream.id.toString(), name, size: req.body.length, type }));
  stream.end(req.body);
};

// GET /api/files/:id — any signed-in member
exports.download = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ msg: 'File not found' });
  const id = new mongoose.Types.ObjectId(req.params.id);
  const [file] = await bucket().find({ _id: id }).toArray();
  if (!file) return res.status(404).json({ msg: 'File not found' });
  res.set('Content-Type', file.metadata?.contentType || 'application/octet-stream');
  res.set('Content-Length', file.length);
  res.set('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename)}"`);
  bucket().openDownloadStream(id).on('error', () => res.end()).pipe(res);
};

// DELETE /api/files/:id
exports.remove = async (req, res) => {
  if (!canUpload(req)) return res.status(403).json({ msg: 'Not allowed to delete files' });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ msg: 'File not found' });
  await bucket().delete(new mongoose.Types.ObjectId(req.params.id)).catch(() => {});
  res.json({ ok: true });
};

exports.MAX_BYTES = MAX_BYTES;
