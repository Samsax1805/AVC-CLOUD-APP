const User = require('../models/User');
const Duty = require('../models/Duty');
const ChatMessage = require('../models/ChatMessage');
const emailService = require('../services/email.service');
const { interpret } = require('../services/dutyParser');
const { lagosNow } = require('../services/birthday.service');

// Who may give out duties; everyone can receive them and reply. Only admins read other people's chats.
const ASSIGNERS = ['admin', 'president', 'provost', 'pro', 'secretary', 'choirmaster', 'asstchoirmaster'];
const canAssign = (roles = []) => !roles.includes('alumni') && roles.some((r) => ASSIGNERS.includes(r));
const isAdmin = (roles = []) => roles.includes('admin');
const OPEN = ['assigned', 'accepted'];
const STATUS = { assigned: 'waiting for a reply', accepted: 'accepted', declined: "can't do it", done: 'done ✅', cancelled: 'cancelled' };

const first = (name) => String(name || '').split(' ')[0];
const dayLabel = (d) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
const line = (d, view) => `#${d.num} ${d.title}${d.due ? ` — ${dayLabel(d.due)}` : ''}${view === 'assignee' ? ` (from ${first(d.assignerName)})` : ` → ${d.assigneeName}`} · ${STATUS[d.status]}`;
const clean = ({ _id, __v, ...x }) => ({ id: _id.toString(), ...x });

const HELP = (assigner) => [
  "Hi! I'm the duty assistant. Type to me like a message:",
  ...(assigner ? [
    '• assign Grace to lead the offertory hymn on Sunday',
    '• Tobi and Ada - first reading - 16 Nov',
    '• open duties  ·  duties of Grace  ·  cancel 12',
  ] : []),
  '• my duties',
  '• accept 12  ·  done 12  ·  can\'t 12 travelling that day',
  'This conversation is private. Only the choir admin can review duty chats.',
].join('\n');

const say = (userId, text, dutyNum) => ChatMessage.create({ userId: String(userId), from: 'bot', text, dutyNum });

const nextNum = async () => {
  const last = await Duty.findOne({}, { num: 1 }).sort({ num: -1 }).lean();
  return (last?.num || 0) + 1;
};

const createDuty = async (assigner, member, title, due) => {
  for (let tries = 0; tries < 5; tries += 1) {
    try {
      return await Duty.create({
        num: await nextNum(), title, due, assigneeId: String(member._id), assigneeName: member.name,
        assignerId: String(assigner.id), assignerName: assigner.name,
        history: [{ at: new Date(), byName: assigner.name, action: 'assigned' }],
      });
    } catch (e) { if (e.code !== 11000) throw e; } // two duties created at once: take the next number
  }
  throw new Error('Could not number the duty');
};

// Finds the duty a reply is about: the number typed, or the only one waiting on this person
const findDuty = async (me, num, action) => {
  if (num) return Duty.findOne({ num });
  const mine = action === 'cancel'
    ? await Duty.find({ assignerId: me.id, status: { $in: OPEN } }).lean()
    : await Duty.find({ assigneeId: me.id, status: { $in: action === 'done' ? OPEN : ['assigned'] } }).lean();
  return mine.length === 1 ? Duty.findOne({ num: mine[0].num }) : { many: mine.length };
};

// Accept / decline / done (assignee) and cancel (assigner or admin); tells the other side in their chat
const applyStatus = async (me, duty, action, note) => {
  const mineToDo = duty.assigneeId === me.id;
  const iGaveIt = duty.assignerId === me.id || isAdmin(me.roles);
  if (action === 'cancel' ? !iGaveIt : !mineToDo) return `Duty #${duty.num} isn't ${action === 'cancel' ? 'one you gave out' : 'assigned to you'}.`;
  if (!OPEN.includes(duty.status)) return `Duty #${duty.num} is already ${STATUS[duty.status]}.`;
  if (action === 'accept' && duty.status === 'accepted') return `You've already accepted #${duty.num}.`;
  duty.status = { accept: 'accepted', decline: 'declined', done: 'done', cancel: 'cancelled' }[action];
  duty.history.push({ at: new Date(), byName: me.name, action: duty.status, note: note || undefined });
  await duty.save();
  const why = note ? ` — "${note}"` : '';
  if (action === 'cancel') {
    await say(duty.assigneeId, `❌ ${first(me.name)} cancelled duty #${duty.num}: ${duty.title}. You don't need to do it.`, duty.num);
    return `Cancelled #${duty.num}. I've told ${first(duty.assigneeName)}.`;
  }
  const verb = { accept: 'accepted', decline: "can't do", done: 'finished' }[action];
  await say(duty.assignerId, `${action === 'decline' ? '⚠️' : '✅'} ${duty.assigneeName} ${verb} #${duty.num}: ${duty.title}${why}`, duty.num);
  return { accept: `Thanks! #${duty.num} is yours. Type "done ${duty.num}" when it's finished.`, decline: `Noted — I've told ${first(duty.assignerName)} you can't do #${duty.num}.`, done: `Well done! #${duty.num} is marked as finished. 🎉` }[action];
};

const respond = async (me, text) => {
  const assigner = canAssign(me.roles);
  const members = (await User.find({ status: 'active' }, { name: 1, email: 1, roles: 1 }).lean()).filter((u) => !(u.roles || []).includes('alumni'));
  const today = lagosNow().date;
  const it = interpret(text, { members, today });
  switch (it.kind) {
    case 'help': case 'empty': return HELP(assigner);
    case 'mine': {
      const list = await Duty.find({ assigneeId: me.id, status: { $in: OPEN } }).sort({ due: 1, num: 1 }).lean();
      return list.length ? `Your open duties:\n${list.map((d) => `• ${line(d, 'assignee')}`).join('\n')}` : 'You have no open duties right now. 🙌';
    }
    case 'open': {
      if (!assigner) return 'Only officers can see all open duties. Type "my duties" for yours.';
      const q = isAdmin(me.roles) || me.roles.includes('president') ? { status: { $in: OPEN } } : { assignerId: me.id, status: { $in: OPEN } };
      const list = await Duty.find(q).sort({ due: 1, num: 1 }).limit(30).lean();
      return list.length ? `Open duties${q.assignerId ? ' you gave out' : ''}:\n${list.map((d) => `• ${line(d)}`).join('\n')}` : 'No open duties. 🙌';
    }
    case 'dutiesOf': {
      if (!assigner) return 'Only officers can look up other members\' duties.';
      const list = await Duty.find({ assigneeId: String(it.member._id), status: { $in: OPEN } }).sort({ due: 1 }).lean();
      return list.length ? `${it.member.name}'s open duties:\n${list.map((d) => `• ${line(d)}`).join('\n')}` : `${it.member.name} has no open duties.`;
    }
    case 'status': {
      const duty = await findDuty(me, it.num, it.action);
      if (!duty) return `I can't find duty #${it.num}.`;
      if (duty.many !== undefined) return duty.many ? `You have ${duty.many} duties that could match — add the number, e.g. "${it.action} 12". Type "my duties" to see them.` : 'There\'s nothing waiting on you right now.';
      return applyStatus(me, duty, it.action, it.note);
    }
    case 'ambiguous': return `More than one member matches: ${it.names.join(', ')}. Please use the full name.`;
    case 'unknownName': return `I couldn't find a member called "${it.text.split(' ').slice(0, 3).join(' ')}". Check the spelling, or use their full name.`;
    case 'badDate': return "That date doesn't exist — try e.g. \"on Sunday\", \"16 Nov\" or \"16/11\".";
    case 'noTask': return `What should ${it.members.map((m) => first(m.name)).join(' and ')} do? e.g. "assign ${first(it.members[0].name)} to lead the offertory hymn on Sunday".`;
    case 'assign': {
      if (!assigner) return 'Only officers (President, Provost, PRO, Secretary, Choir Master or admin) can give out duties. Type "my duties" to see yours.';
      if (it.due && it.due < today) return 'That date has already passed — please pick a date from today onwards.';
      const lines = [];
      for (const m of it.members) {
        const d = await createDuty(me, m, it.title, it.due);
        await say(m._id, `📋 New duty from ${me.name}:\n#${d.num} ${d.title}${d.due ? ` — ${dayLabel(d.due)}` : ''}\nReply "accept ${d.num}", "can't ${d.num}" (with a reason) or "done ${d.num}" when finished.`, d.num);
        emailService.sendDutyEmail(m, me.name, d, dayLabel(d.due));
        lines.push(`#${d.num} → ${m.name}`);
      }
      return `✅ Assigned "${it.title}"${it.due ? ` for ${dayLabel(it.due)}` : ''}:\n${lines.join('\n')}\nI've messaged ${it.members.length > 1 ? 'them' : first(it.members[0].name)} and sent an email.`;
    }
    default: return `Sorry, I didn't understand that.\n\n${HELP(assigner)}`;
  }
};

const state = async (me) => {
  const [messages, mine, given] = await Promise.all([
    ChatMessage.find({ userId: me.id }).sort({ createdAt: -1 }).limit(100).lean(),
    Duty.find({ assigneeId: me.id }).sort({ updatedAt: -1 }).limit(20).lean(),
    canAssign(me.roles) ? Duty.find({ assignerId: me.id }).sort({ updatedAt: -1 }).limit(20).lean() : [],
  ]);
  return { messages: messages.reverse().map(clean), duties: { mine: mine.map(clean), given: given.map(clean) }, canAssign: canAssign(me.roles) };
};

const meOf = async (req) => {
  const u = await User.findById(req.user.id, { name: 1, roles: 1 }).lean();
  return u && { id: String(u._id), name: u.name, roles: u.roles || [] };
};

// GET /api/assistant — your conversation and duties; opening it marks the assistant's messages read
exports.get = async (req, res) => {
  const me = await meOf(req);
  if (!me) return res.status(404).json({ msg: 'User not found' });
  const out = await state(me);
  if (!out.messages.length) {
    await ChatMessage.create({ userId: me.id, from: 'bot', text: HELP(out.canAssign), read: true });
    return res.json(await state(me));
  }
  await ChatMessage.updateMany({ userId: me.id, from: 'bot', read: false }, { $set: { read: true } });
  res.json(out);
};

// GET /api/assistant/unread — badge count on the chat button
exports.unread = async (req, res) => {
  res.json({ unread: await ChatMessage.countDocuments({ userId: req.user.id, from: 'bot', read: false }) });
};

// POST /api/assistant { text }
exports.send = async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ msg: 'Type a message' });
  const me = await meOf(req);
  if (!me) return res.status(404).json({ msg: 'User not found' });
  await ChatMessage.create({ userId: me.id, from: 'user', text, read: true });
  const reply = await respond(me, text);
  await ChatMessage.create({ userId: me.id, from: 'bot', text: reply, read: true });
  res.json(await state(me));
};

// POST /api/assistant/duties/:num/:action — the buttons under a duty (same rules as typing it)
exports.action = async (req, res) => {
  const { num, action } = req.params;
  if (!['accept', 'decline', 'done', 'cancel'].includes(action)) return res.status(400).json({ msg: 'Unknown action' });
  const me = await meOf(req);
  const duty = await Duty.findOne({ num: +num });
  if (!duty) return res.status(404).json({ msg: 'Duty not found' });
  const label = { accept: 'Accept', decline: "Can't do it", done: 'Done', cancel: 'Cancel' }[action];
  await ChatMessage.create({ userId: me.id, from: 'user', text: `${label} #${duty.num}`, read: true });
  await ChatMessage.create({ userId: me.id, from: 'bot', text: await applyStatus(me, duty, action, ''), read: true });
  res.json(await state(me));
};

// GET /api/assistant/logs — every conversation and duty; admin only
exports.logs = async (req, res) => {
  if (!isAdmin(req.user.roles)) return res.status(403).json({ msg: 'Only the admin can view duty chat logs' });
  const [messages, duties, users] = await Promise.all([
    ChatMessage.find({}).sort({ createdAt: 1 }).limit(5000).lean(),
    Duty.find({}).sort({ num: -1 }).limit(500).lean(),
    User.find({}, { name: 1 }).lean(),
  ]);
  const names = Object.fromEntries(users.map((u) => [String(u._id), u.name]));
  const threads = {};
  for (const m of messages) (threads[m.userId] ||= { userId: m.userId, name: names[m.userId] || 'Former member', messages: [] }).messages.push(clean(m));
  res.json({
    threads: Object.values(threads).filter((t) => t.messages.some((m) => m.from === 'user'))
      .sort((a, b) => String(b.messages.at(-1).createdAt).localeCompare(String(a.messages.at(-1).createdAt))),
    duties: duties.map(clean),
  });
};

exports.respond = respond;
