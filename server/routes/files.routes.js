const express = require('express');
const c = require('../controllers/files.controller');
const auth = require('../middleware/auth');
const r = express.Router();

r.post('/', auth, express.raw({ type: () => true, limit: c.MAX_BYTES }), c.upload);
r.get('/:id', auth, c.download);
r.delete('/:id', auth, c.remove);

module.exports = r;
