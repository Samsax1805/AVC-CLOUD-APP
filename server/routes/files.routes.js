const express = require('express');
const c = require('../controllers/files.controller');
const auth = require('../middleware/auth');
const r = express.Router();

r.post('/upload-url', auth, c.uploadUrl);
r.get('/:id/url', auth, c.downloadUrl);
r.get('/:id', auth, c.download);
r.delete('/:id', auth, c.remove);

module.exports = r;
