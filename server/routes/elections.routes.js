const express = require('express');
const c = require('../controllers/elections.controller');
const auth = require('../middleware/auth');
const r = express.Router();

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error('Elections error:', e.message); res.status(500).json({ msg: 'Election request failed' }); });

const cy = require('../controllers/electionCycle.controller');
r.get('/current', auth, wrap(cy.current));
r.get('/status', auth, wrap(async (req, res) => res.json({ status: await cy.status(req.user.roles || []) })));
r.get('/past', auth, wrap(cy.past));
r.post('/current/runoff', auth, wrap(cy.runoff));
r.post('/cycles', auth, wrap(cy.create));
r.post('/current/revert', auth, wrap(cy.revert));
r.delete('/cycles/:id', auth, wrap(cy.remove));
r.delete('/polls/:id', auth, wrap(cy.removePoll));
r.delete('/logs', auth, wrap(cy.removeLogs));
r.put('/current/offices', auth, wrap(cy.offices));
r.put('/current/candidates', auth, wrap(cy.candidates));
r.post('/current/stage', auth, wrap(cy.stage));
r.post('/current/nominations', auth, wrap(cy.nominate));
r.post('/current/vote', auth, wrap(cy.vote));
r.delete('/current', auth, wrap(cy.cancel));
r.get('/', auth, wrap(c.list));
r.post('/:id/vote', auth, (req, res) => res.status(410).json({ msg: 'Voting now happens in the current election on the Elections page' }));

module.exports = r;
