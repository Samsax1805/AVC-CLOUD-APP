const { Misc } = require('../models/records');

// Records the server deleted on purpose (an admin removing election logs or notices).
// Browsers send their whole copy of the data on every save; without this list an open page
// that still had a deleted record would quietly put it back.
const KEY = 'tombstones';
const MAX_PER_KIND = 5000;

const get = async () => (await Misc.findOne({ key: KEY }).lean())?.data || {};

const add = async (kind, ids) => {
  const list = [...new Set((ids || []).map(String))];
  if (!list.length) return;
  const cur = await get();
  const next = { ...cur, [kind]: [...new Set([...(cur[kind] || []), ...list])].slice(-MAX_PER_KIND) };
  await Misc.updateOne({ key: KEY }, { $set: { key: KEY, data: next } }, { upsert: true });
};

module.exports = { get, add };
