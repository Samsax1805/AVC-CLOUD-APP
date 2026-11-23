const crypto = require('crypto');
const { Misc } = require('../models/records');
const { lagosNow } = require('./birthday.service');

// The roles each member has held, and when. Written by the server only, one change at a time
// (atomic, so two role changes at the same moment are both kept).
const today = () => lagosNow(new Date()).date;
const granted = (userId, role) => Misc.updateOne(
  { key: 'roleHistory' },
  { $push: { data: { $each: [{ id: `rh-${crypto.randomUUID().slice(0, 8)}`, userId: String(userId), role, granted: today(), revoked: null }], $position: 0 } } },
  { upsert: true },
);
const revoked = (userId, role) => Misc.updateOne(
  { key: 'roleHistory' },
  { $set: { 'data.$[h].revoked': today() } },
  { arrayFilters: [{ 'h.userId': String(userId), 'h.role': role, 'h.revoked': null }] },
).catch(() => {});
const list = async () => { const cur = await Misc.findOne({ key: 'roleHistory' }).lean(); return Array.isArray(cur?.data) ? cur.data : []; };

module.exports = { granted, revoked, list };
