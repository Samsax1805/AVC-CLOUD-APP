import React from 'react';
import { motion } from 'framer-motion';
import Avatar from './ui/Avatar';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SPARKS = ['🎈', '🎉', '🎂', '✨', '🎶', '🎁', '🥳', '🎵'];

// Days from today until this person's next birthday (0 = today). Uses the local date,
// and celebrates 29 February birthdays on 28 February in non-leap years.
const daysUntil = (dob, now) => {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(dob || '');
  if (!m) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const next = (y) => {
    const leap = new Date(y, 1, 29).getMonth() === 1;
    const day = +m[1] === 2 && +m[2] === 29 && !leap ? 28 : +m[2];
    return new Date(y, +m[1] - 1, day);
  };
  let d = next(today.getFullYear());
  if (d < today) d = next(today.getFullYear() + 1);
  return Math.round((d - today) / 86400000);
};

export default function BirthdayBanner({ users = [], me }) {
  const now = new Date();
  const people = users
    .filter((u) => (u.status || 'active') === 'active')
    .map((u) => ({ u, days: daysUntil(u.dob, now) }))
    .filter((x) => x.days !== null && x.days <= 7)
    .sort((a, b) => a.days - b.days);
  const today = people.filter((x) => x.days === 0).map((x) => x.u);
  const soon = people.filter((x) => x.days > 0);
  if (!today.length && !soon.length) return null;

  const meToday = today.some((u) => u.id === me?.id);
  const others = today.filter((u) => u.id !== me?.id);
  const first = (u) => u.name.split(' ')[0];
  const names = (list) => (list.length <= 2 ? list.map(first).join(' & ') : `${list.slice(0, -1).map(first).join(', ')} & ${first(list[list.length - 1])}`);

  if (!today.length) {
    return (
      <motion.div className="bday-soon" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
        <span className="bday-soon-ic">🎂</span>
        <span><b>Birthdays this week:</b>{' '}
          {soon.map(({ u, days }, i) => {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
            return <span key={u.id}>{i > 0 && ' · '}{u.name} <span className="bday-when">{days === 1 ? 'tomorrow' : `${MONTHS[d.getMonth()]} ${d.getDate()}`}</span></span>;
          })}
        </span>
      </motion.div>
    );
  }

  return (
    <motion.div className="bday-card" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 16 }}>
      <div className="bday-sparks" aria-hidden="true">
        {SPARKS.map((s, i) => <span key={i} style={{ left: `${6 + i * 12}%`, animationDelay: `${i * 0.45}s` }}>{s}</span>)}
      </div>
      <div className="bday-avatars">
        {today.slice(0, 4).map((u) => <div className="bday-av" key={u.id}><Avatar user={u} size={58} /></div>)}
        {today.length > 4 && <div className="bday-more">+{today.length - 4}</div>}
      </div>
      <div className="bday-text">
        <div className="bday-kicker">🎉 Celebrant{today.length > 1 ? 's' : ''} of the day</div>
        {meToday ? (
          <>
            <h3>Happy Birthday, {first(me)}! 🎂</h3>
            <p>The whole St. Barnabas Amazing Voices family celebrates you today. May your year be full of joy and beautiful songs.{others.length ? ` You share the day with ${names(others)}!` : ''}</p>
          </>
        ) : (
          <>
            <h3>It's {names(today)}'s birthday! 🎂</h3>
            <p>Join the choir in celebrating {today.length > 1 ? 'them' : first(today[0])} today. Send a song, a prayer or a warm wish 🎶</p>
          </>
        )}
        {soon.length > 0 && <div className="bday-next">Coming up: {soon.slice(0, 3).map(({ u, days }) => `${first(u)} (${days === 1 ? 'tomorrow' : `in ${days} days`})`).join(' · ')}</div>}
      </div>
    </motion.div>
  );
}
