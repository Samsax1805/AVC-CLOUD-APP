const { isSystem } = require('../config/system');
const push = require('./push.service');
const User = require('../models/User');
const { Notification } = require('../models/records');
const emailService = require('./email.service');

// Every morning (from 07:00 Lagos time) each celebrant gets a notification to the whole choir
// and a birthday email from the choir. Safe to run many times a day: each one happens once.
const ZONE = 'Africa/Lagos';
const SEND_FROM_HOUR = 7;
const CHECK_EVERY_MS = 30 * 60 * 1000;

const lagosNow = (now = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: +parts.hour };
};

// 29 February birthdays are celebrated on 28 February in other years
const isBirthday = (dob, date) => {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(dob || '');
  if (!m) return false;
  const [y, mo, d] = date.split('-').map(Number);
  const leap = new Date(Date.UTC(y, 1, 29)).getUTCMonth() === 1;
  const day = +m[1] === 2 && +m[2] === 29 && !leap ? 28 : +m[2];
  return +m[1] === mo && day === d;
};

const first = (name) => String(name || '').split(' ')[0];

const run = async (now = new Date()) => {
  const { date, hour } = lagosNow(now);
  if (hour < SEND_FROM_HOUR) return [];
  const members = (await User.find({ status: 'active' }, { name: 1, email: 1, dob: 1, roles: 1 }).lean()).filter((u) => !isSystem(u));
  const celebrants = members.filter((u) => !(u.roles || []).includes('alumni') && isBirthday(u.dob, date));
  const done = [];
  for (const u of celebrants) {
    const uid = `bday-${date}-${u._id}`;
    // Only the first run of the day creates it; that run also sends the email
    const r = await Notification.updateOne(
      { uid },
      { $setOnInsert: { uid, text: `🎂 Today is ${u.name}'s birthday! Send a song, a prayer or a warm wish.`, date, readBy: [] } },
      { upsert: true },
    );
    if (!r.upsertedCount) continue;
    push.toAll(`🎂 Today is ${u.name}'s birthday! Send a song, a prayer or a warm wish.`, uid);
    await emailService.sendBirthdayWish(u, first(u.name));
    done.push(u.email);
  }
  if (done.length) console.log(`🎂 Birthday wishes sent for ${date}: ${done.length}`);
  return done;
};

const start = () => {
  const tick = () => run().catch((e) => console.error('Birthday check failed:', e.message));
  tick();
  setInterval(tick, CHECK_EVERY_MS).unref();
};

module.exports = { start, run, isBirthday, lagosNow };
