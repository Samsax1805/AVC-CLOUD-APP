const express = require('express');
const c = require('../controllers/records.controller');
const auth = require('../middleware/auth');
const safe = require('../middleware/safe');
const r = express.Router();

r.post('/debts/:id/pay', auth, safe(c.pay));
r.post('/:kind', auth, safe(c.create));
r.put('/:kind/:id', auth, safe(c.update));
r.delete('/:kind/:id', auth, safe(c.remove));

module.exports = r;
