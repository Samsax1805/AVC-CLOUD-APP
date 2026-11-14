const User = require('../models/User');
const PsalmDay = require('../models/PsalmDay');
const ChatMessage = require('../models/ChatMessage');
const emailService = require('./email.service');
const { lagosNow } = require('./birthday.service');

// Reminds each psalmist two weeks and one week before a published date: a private alert in their
// duty chat plus an email. Each reminder goes out once; if a date is published late, the right one goes at once.
const CHECK_EVERY_MS = 30 * 60 * 1000;
const SEND_FROM_HOUR = 7;

const daysBetween = (from, to) => Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 864e5);
const dayLabel = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const first = (name) => String(name || '').split(' ')[0];

const run = async (now = new Date(), { ignoreHour = false } = {}) => {
  const { date: today, hour } = lagosNow(now);
  if (hour < SEND_FROM_HOUR && !ignoreHour) return [];
  const until = new Date(`${today}T00:00:00Z`); until.setUTCDate(until.getUTCDate() + 14);
  const days = await PsalmDay.find({ published: true, date: { $gte: today, $lte: until.toISOString().slice(0, 10) } });
  const sent = [];
  for (const day of days) {
    const left = daysBetween(today, day.date);
    if (left < 1) continue;
    for (const uid of day.psalmistIds || []) {
      const which = left <= 7 ? '7' : '14';
      if ((day.reminders || []).includes(`${uid}:${which}`)) continue;
      const member = await User.findById(uid, { name: 1, email: 1, status: 1 }).lean();
      if (!member || member.status !== 'active') continue;
      const when = left === 7 ? 'in one week' : left === 14 ? 'in two weeks' : `in ${left} day${left === 1 ? '' : 's'}`;
      await ChatMessage.create({ userId: String(uid), from: 'bot', text: `🎤 Psalmist reminder: you are the responsorial psalmist ${when} — ${dayLabel(day.date)}, ${day.title}.${day.note ? `\nNote: ${day.note}` : ''}\nSee the Psalmists page for the full list.` });
      emailService.sendPsalmistReminder(member, first(member.name), day, dayLabel(day.date), when);
      // A one-week reminder also covers the two-week one if that was missed
      day.reminders = [...new Set([...(day.reminders || []), `${uid}:${which}`, ...(which === '7' ? [`${uid}:14`] : [])])];
      sent.push(`${uid}:${which}`);
    }
    if (day.isModified('reminders')) await day.save();
  }
  if (sent.length) console.log(`🎤 Psalmist reminders sent: ${sent.length}`);
  return sent;
};

const start = () => {
  const tick = () => run().catch((e) => console.error('Psalmist reminder check failed:', e.message));
  tick();
  setInterval(tick, CHECK_EVERY_MS).unref();
};

module.exports = { start, run, daysBetween };
