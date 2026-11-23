const PushSubscription = require('../models/PushSubscription');
const push = require('../services/push.service');
const security = require('../services/security.service');

// GET /api/push/key — the public key a browser needs to subscribe (null when notifications are not set up)
exports.key = async (req, res) => res.json({ key: push.publicKey() });

// POST /api/push/subscribe { subscription } — this device says yes
exports.subscribe = async (req, res) => {
  const s = req.body?.subscription;
  const ok = s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000
    && typeof s.keys?.p256dh === 'string' && typeof s.keys?.auth === 'string' && s.keys.p256dh.length < 200 && s.keys.auth.length < 100;
  if (!ok) return res.status(400).json({ msg: 'Invalid request' });
  if (!push.publicKey()) return res.status(503).json({ msg: 'Notifications are not switched on for this site yet' });
  const device = security.deviceOf(req.headers['user-agent']);
  await PushSubscription.updateOne({ endpoint: s.endpoint }, { $set: { userId: req.user.id, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, device } }, { upsert: true });
  // At most 10 devices a member; the oldest go first
  const mine = await PushSubscription.find({ userId: req.user.id }, { _id: 1 }).sort({ updatedAt: -1 }).lean();
  if (mine.length > 10) await PushSubscription.deleteMany({ _id: { $in: mine.slice(10).map((m) => m._id) } });
  res.json({ ok: true });
};

// POST /api/push/unsubscribe { endpoint } — this device says no more
exports.unsubscribe = async (req, res) => {
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
  await PushSubscription.deleteOne({ endpoint, userId: req.user.id });
  res.json({ ok: true });
};

// POST /api/push/test — a test notification to this member's own devices
exports.test = async (req, res) => {
  const r = await push.toUsers([req.user.id], '🔔 Notifications are working on this device.', 'test');
  res.json({ ok: true, sent: r?.sent || 0 });
};
