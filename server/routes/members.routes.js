const express = require('express');
const c = require('../controllers/members.controller');
const auth = require('../middleware/auth');
const safe = require('../middleware/safe');
const r = express.Router();

r.post('/', auth, safe(c.add));
r.post('/:id/approve', auth, safe(c.approve));
r.post('/:id/section', auth, safe(c.section));
r.post('/:id/reject', auth, safe(c.reject));
r.post('/:id/deactivate', auth, safe(c.deactivate));
r.post('/:id/reactivate', auth, safe(c.reactivate));
r.post('/:id/roles', auth, safe(c.roles));

module.exports = r;
