const express = require('express');
const c = require('../controllers/data.controller');
const auth = require('../middleware/auth');
const r = express.Router();

console.log('🔧 Registering data routes...');

r.get('/', auth, c.getAll);
console.log('  ✓ GET /');

// The whole-choir save is retired: every kind of record is now saved on its own (/api/records, /api/members,
// /api/notices, /api/audit and the feature routes). A page still open on an older version is asked to refresh.
r.put('/', auth, (req, res) => res.status(409).json({ msg: 'Choir Cloud was updated. Refresh the page to keep working: nothing you saved before is lost.', code: 'REFRESH' }));
console.log('  ✓ PUT / (retired)');

module.exports = r;