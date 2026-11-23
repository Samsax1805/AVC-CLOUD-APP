const push = require('../services/push.service');
const mongoose = require('mongoose');
const User = require('../models/User');
const DirectMessage = require('../models/DirectMessage');
const ChatMessage = require('../models/ChatMessage');

// Private one-to-one messages between active members. Only the two members read a conversation;
// the admin can review all chats from the Security page.
const pairOf = (a, b) => [String(a), String(b)].sort().join(':');
const clean = ({ _id, __v, pair, ...m }) => ({ id: _id.toString(), ...m });
const MAX_LEN = 1000;

const activeMember = async (id) => {
  if (!mongoose.isValidObjectId(id)) return null;
  const u = await User.findById(id, { name: 1, status: 1, section: 1, roles: 1 }).lean();
  return u && u.status === 'active' && !(u.roles || []).includes('alumni') ? u : null;
};

// GET /api/messages — my conversations, newest first, plus the duty assistant's unread count
exports.conversations = async (req, res) => {
  const me = String(req.user.id);
  const mine = await DirectMessage.find({ $or: [{ from: me }, { to: me }] }).sort({ createdAt: -1 }).limit(2000).lean();
  const byOther = new Map();
  for (const m of mine) {
    const other = m.from === me ? m.to : m.from;
    if (!byOther.has(other)) byOther.set(other, { userId: other, last: clean(m), unread: 0 });
    if (m.to === me && !m.read) byOther.get(other).unread += 1;
  }
  const users = await User.find({ _id: { $in: [...byOther.keys()].filter((id) => mongoose.isValidObjectId(id)) } }, { name: 1, status: 1 }).lean();
  const names = Object.fromEntries(users.map((u) => [String(u._id), u]));
  const assistantUnread = await ChatMessage.countDocuments({ userId: me, from: 'bot', read: false });
  res.json({
    assistantUnread,
    conversations: [...byOther.values()].map((c) => ({ ...c, name: names[c.userId]?.name || 'Former member', active: names[c.userId]?.status === 'active' })),
  });
};

// GET /api/messages/unread — badge on the chat button (private messages + duty assistant)
exports.unread = async (req, res) => {
  const me = String(req.user.id);
  const [dm, bot] = await Promise.all([
    DirectMessage.countDocuments({ to: me, read: false }),
    ChatMessage.countDocuments({ userId: me, from: 'bot', read: false }),
  ]);
  res.json({ unread: dm + bot });
};

// GET /api/messages/contacts — members you can start a conversation with
exports.contacts = async (req, res) => {
  // Old Members are view-only and have no chat, so they aren't offered as contacts
  const users = await User.find({ status: 'active', _id: { $ne: req.user.id }, roles: { $ne: 'alumni' } }, { name: 1, section: 1 }).sort({ name: 1 }).lean();
  res.json({ contacts: users.map((u) => ({ id: String(u._id), name: u.name, part: u.section || '' })) });
};

// GET /api/messages/with/:id — the conversation with one member; marks their messages to me as read
exports.thread = async (req, res) => {
  const me = String(req.user.id);
  const other = await User.findById(mongoose.isValidObjectId(req.params.id) ? req.params.id : null, { name: 1, status: 1, section: 1, roles: 1 }).lean();
  if (!other) return res.status(404).json({ msg: 'Member not found' });
  const pair = pairOf(me, other._id);
  const messages = await DirectMessage.find({ pair }).sort({ createdAt: -1 }).limit(200).lean();
  await DirectMessage.updateMany({ pair, to: me, read: false }, { $set: { read: true } });
  res.json({ with: { id: String(other._id), name: other.name, part: other.section || '', active: other.status === 'active' && !(other.roles || []).includes('alumni') }, messages: messages.reverse().map(clean) });
};

// POST /api/messages/with/:id { text }
exports.send = async (req, res) => {
  const me = String(req.user.id);
  const text = String(req.body?.text || '').trim().slice(0, MAX_LEN);
  if (!text) return res.status(400).json({ msg: 'Type a message' });
  if (req.params.id === me) return res.status(400).json({ msg: "You can't message yourself" });
  const other = await activeMember(req.params.id);
  if (!other) return res.status(404).json({ msg: 'That member is not active' });
  await DirectMessage.create({ pair: pairOf(me, other._id), from: me, to: String(other._id), text });
  const sender = await User.findById(me, { name: 1 }).lean();
  push.toUsers([String(other._id)], `💬 ${sender?.name || 'A member'}: ${text.length > 120 ? `${text.slice(0, 117)}…` : text}`, `dm-${me}`);
  return exports.thread(req, res);
};

// GET /api/messages/logs — every private conversation; admin only
exports.logs = async (req, res) => {
  if (!(req.user.roles || []).includes('admin')) return res.status(403).json({ msg: 'Only the admin can review chats' });
  const [messages, users] = await Promise.all([
    DirectMessage.find({}).sort({ createdAt: 1 }).limit(10000).lean(),
    User.find({}, { name: 1 }).lean(),
  ]);
  const names = Object.fromEntries(users.map((u) => [String(u._id), u.name]));
  const threads = {};
  for (const m of messages) {
    const t = (threads[m.pair] ||= { pair: m.pair, names: m.pair.split(':').map((id) => names[id] || 'Former member'), messages: [] });
    t.messages.push({ ...clean(m), fromName: names[m.from] || 'Former member' });
  }
  res.json({ threads: Object.values(threads).sort((a, b) => String(b.messages.at(-1).createdAt).localeCompare(String(a.messages.at(-1).createdAt))) });
};
