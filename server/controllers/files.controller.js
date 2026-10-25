const crypto = require('crypto');
const mongoose = require('mongoose');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Files live in a private Amazon S3 bucket. The browser uploads and downloads directly
// with short-lived signed links; this server only decides who may do what.
// (Files uploaded before S3 sit in MongoDB GridFS and are still served by download().)
const MAX_BYTES = 100 * 1024 * 1024;
const LINK_SECONDS = 15 * 60;
const UPLOADERS = ['admin', 'president', 'custodian'];
const ALLOWED = /^(audio\/|image\/|video\/|application\/pdf$)/;
const S3_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,8})?$/;

const s3 = new S3Client({ region: process.env.AWS_REGION || 'eu-north-1' });
const bucket = () => process.env.S3_BUCKET;
const keyOf = (id) => `files/${id}`;
const gridfs = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
const canUpload = (req) => (req.user.roles || []).some((r) => UPLOADERS.includes(r)) && !(req.user.roles || []).includes('alumni');

// POST /api/files/upload-url  { name, type, size } → { id, uploadUrl, headers }
exports.uploadUrl = async (req, res) => {
  if (!canUpload(req)) return res.status(403).json({ msg: 'Only the Custodian, President or an admin can upload files' });
  if (!bucket()) return res.status(503).json({ msg: 'File storage is not configured' });
  const { name = 'file', type = '', size = 0 } = req.body || {};
  if (!ALLOWED.test(type)) return res.status(415).json({ msg: 'Only audio, video, image or PDF files can be uploaded' });
  if (!(size > 0)) return res.status(400).json({ msg: 'Empty file' });
  if (size > MAX_BYTES) return res.status(413).json({ msg: `Files can be up to ${MAX_BYTES / 1048576} MB` });
  const ext = (/\.([a-z0-9]{1,8})$/i.exec(name) || [])[1];
  const id = crypto.randomUUID() + (ext ? `.${ext.toLowerCase()}` : '');
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: bucket(), Key: keyOf(id), ContentType: type, ContentLength: size,
  }), { expiresIn: LINK_SECONDS });
  res.json({ id, name: String(name).slice(0, 200), size, type, uploadUrl, headers: { 'Content-Type': type } });
};

// GET /api/files/:id/url?name=… → { url } (any signed-in member)
exports.downloadUrl = async (req, res) => {
  const { id } = req.params;
  if (!S3_ID.test(id)) return res.status(404).json({ msg: 'File not found' });
  const name = String(req.query.name || id).replace(/["\\\r\n]/g, '').slice(0, 200);
  const url = await getSignedUrl(s3, new GetObjectCommand({
    Bucket: bucket(), Key: keyOf(id),
    ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
  }), { expiresIn: LINK_SECONDS });
  res.json({ url, expiresIn: LINK_SECONDS });
};

// GET /api/files/:id — files stored in MongoDB GridFS before the move to S3
exports.download = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ msg: 'File not found' });
  const id = new mongoose.Types.ObjectId(req.params.id);
  const [file] = await gridfs().find({ _id: id }).toArray();
  if (!file) return res.status(404).json({ msg: 'File not found' });
  res.set('Content-Type', file.metadata?.contentType || 'application/octet-stream');
  res.set('Content-Length', file.length);
  res.set('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename)}"`);
  gridfs().openDownloadStream(id).on('error', () => res.end()).pipe(res);
};

// DELETE /api/files/:id — S3 keeps the old version for 30 days, so mistakes can be undone
exports.remove = async (req, res) => {
  if (!canUpload(req)) return res.status(403).json({ msg: 'Not allowed to delete files' });
  const { id } = req.params;
  if (S3_ID.test(id)) await s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key: keyOf(id) })).catch(() => {});
  else if (mongoose.isValidObjectId(id)) await gridfs().delete(new mongoose.Types.ObjectId(id)).catch(() => {});
  res.json({ ok: true });
};
