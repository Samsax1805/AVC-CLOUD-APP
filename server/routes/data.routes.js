const express = require('express');
const c = require('../controllers/data.controller');
const auth = require('../middleware/auth');
const r = express.Router();

console.log('🔧 Registering data routes...');

r.get('/', auth, c.getAll);
console.log('  ✓ GET /');

r.put('/', auth, c.putAll);
console.log('  ✓ PUT /');

module.exports = r;