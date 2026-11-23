const express = require('express');
const c = require('../controllers/calendar.controller');
const auth = require('../middleware/auth');
const safe = require('../middleware/safe');
const r = express.Router();

r.get('/', auth, safe(c.list));
r.post('/events', auth, safe(c.createEvent));
r.put('/events/:id', auth, safe(c.updateEvent));
r.delete('/events/:id', auth, safe(c.removeEvent));
r.put('/setlists/:date', auth, safe(c.saveSetlist));
r.delete('/setlists/:date', auth, safe(c.removeSetlist));

module.exports = r;
