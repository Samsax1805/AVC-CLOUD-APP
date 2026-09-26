const Store = require('../models/Store');
exports.get = async (req, res) => {
  const rows = await Store.find({});
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.data])));
};
exports.put = async (req, res) => {
  for (const [key, data] of Object.entries(req.body || {})) {
    await Store.updateOne({ key }, { key, data }, { upsert: true });
  }
  res.json({ ok: true });
};