const webpush = require('web-push');
const User = require('../models/User');
const PushSubscription = require('../models/PushSubscription');
const { isSystem } = require('../config/system');

// Phone and computer notifications (Web Push). Needs VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env;
// without them everything here quietly does nothing, so the site works the same.
let ready = null;
const setup = () => {
  if (ready !== null) return ready;
  const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv } = process.env;
  ready = !!(pub && priv);
  if (ready) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://avcsb.com', pub, priv);
  return ready;
};
const publicKey = () => (setup() ? process.env.VAPID_PUBLIC_KEY : null);

// Sends to every saved device of the given members; devices the push service says are gone are forgotten
const sendTo = async (subs, payload) => {
  if (!setup() || !subs.length) return { sent: 0 };
  const body = JSON.stringify({ title: 'St. Barnabas AVC', icon: '/icons/icon-192.png', url: '/', ...payload });
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 24 * 3600, urgency: 'normal', topic: payload.tag ? String(payload.tag).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) : undefined });
      sent += 1;
      PushSubscription.updateOne({ _id: s._id }, { $set: { lastOkAt: new Date() } }).catch(() => {});
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await PushSubscription.deleteOne({ _id: s._id }).catch(() => {});
      else console.error('Push failed:', e.statusCode || '', e.message);
    }
  }));
  return { sent };
};

// A notice for the whole choir (active members and Old Members; never the system account)
const toAll = async (text, tag) => {
  if (!setup()) return { sent: 0 };
  const people = (await User.find({ status: 'active' }, { email: 1 }).lean()).filter((u) => !isSystem(u)).map((u) => String(u._id));
  return sendTo(await PushSubscription.find({ userId: { $in: people } }).lean(), { body: text, tag });
};
// A message for particular members
const toUsers = async (userIds, text, tag) => (setup() ? sendTo(await PushSubscription.find({ userId: { $in: userIds.map(String) } }).lean(), { body: text, tag }) : { sent: 0 });
// Never let a push problem break the action that caused it
const quiet = (p) => Promise.resolve(p).catch((e) => console.error('Push failed:', e.message));

module.exports = { publicKey, toAll: (t, tag) => quiet(toAll(t, tag)), toUsers: (ids, t, tag) => quiet(toUsers(ids, t, tag)), sendTo, ready: setup };
