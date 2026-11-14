const express = require('express');
const c = require('../controllers/psalmists.controller');
const auth = require('../middleware/auth');
const safe = require('../middleware/safe');
const r = express.Router();

r.get('/', auth, safe(c.list));
r.post('/batch', auth, safe(c.batch));
r.post('/publish', auth, safe(c.publish));
r.post('/import', auth, safe(c.import));
r.post('/', auth, safe(c.create));
r.patch('/:id', auth, safe(c.update));
r.delete('/:id', auth, safe(c.remove));

module.exports = r;
