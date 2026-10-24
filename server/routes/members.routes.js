const express = require('express');
const c = require('../controllers/members.controller');
const auth = require('../middleware/auth');
const r = express.Router();

r.post('/:id/approve', auth, c.approve);
r.post('/:id/reject', auth, c.reject);
r.post('/:id/deactivate', auth, c.deactivate);
r.post('/:id/reactivate', auth, c.reactivate);

module.exports = r;
