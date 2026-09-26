const express = require('express');
const c = require('../controllers/state.controller');
const auth = require('../middleware/auth');
const r = express.Router();
r.get('/', auth, c.get);
r.put('/', auth, c.put);
module.exports = r;