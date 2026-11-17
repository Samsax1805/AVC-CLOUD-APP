const express = require('express');
const c = require('../controllers/finance.controller');
const auth = require('../middleware/auth');
const r = express.Router();

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  // Two changes to the same month at the same moment: the second is asked to reload rather than failing
  if (e.name === 'VersionError') return res.status(409).json({ msg: 'This month was changed somewhere else. The latest copy has been loaded.', conflict: true });
  console.error('Finance error:', e.message);
  res.status(500).json({ msg: 'The accounts could not be reached. Try again.' });
});

r.get('/', auth, wrap(c.overview));
r.get('/published', auth, wrap(c.published));
r.post('/books', auth, wrap(c.createBook));
r.put('/books/:id', auth, wrap(c.updateBook));
r.delete('/books/:id', auth, wrap(c.removeBook));
r.post('/books/:id/months', auth, wrap(c.createMonth));
r.get('/sheets/:id', auth, wrap(c.sheet));
r.put('/sheets/:id', auth, wrap(c.saveMonth));
r.post('/sheets/:id/action', auth, wrap(c.action));
r.post('/sheets/:id/restore', auth, wrap(c.restore));
r.delete('/sheets/:id', auth, wrap(c.removeMonth));

module.exports = r;
