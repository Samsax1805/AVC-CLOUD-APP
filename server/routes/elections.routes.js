const express = require('express');
const c = require('../controllers/elections.controller');
const auth = require('../middleware/auth');
const r = express.Router();

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error('Elections error:', e.message); res.status(500).json({ msg: 'Election request failed' }); });

r.get('/', auth, wrap(c.list));
r.post('/:id/vote', auth, wrap(c.vote));

module.exports = r;
