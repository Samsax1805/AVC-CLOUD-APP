const express = require('express');
const c = require('../controllers/library.controller');
const auth = require('../middleware/auth');
const safe = require('../middleware/safe');
const r = express.Router();

// Choir Music & Instrument Library: the upload queue (stage A)
r.get('/lists', auth, safe(c.lists));
r.post('/uploads', auth, safe(c.uploadSlot));
r.post('/uploads/parts', auth, safe(c.partLinks));
r.post('/uploads/abort', auth, safe(c.abortUpload));
r.get('/items', auth, safe(c.list));
r.post('/items', auth, safe(c.create));
r.get('/items/:uid', auth, safe(c.get));
r.patch('/items/:uid', auth, safe(c.save));
r.delete('/items/:uid', auth, safe(c.remove));
r.post('/items/:uid/files', auth, safe(c.addFile));
r.patch('/items/:uid/files/:fid', auth, safe(c.changeFile));
r.delete('/items/:uid/files/:fid', auth, safe(c.removeFile));
r.post('/items/:uid/claim', auth, safe(c.claim));
r.post('/items/:uid/presence', auth, safe(c.presence));
r.post('/items/:uid/duplicate', auth, safe(c.duplicate));

module.exports = r;
