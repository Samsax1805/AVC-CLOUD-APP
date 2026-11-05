const SecurityEvent = require('../models/SecurityEvent');
const User = require('../models/User');
const emailService = require('./email.service');

// Nginx appends the real client address last; earlier entries can be forged by the client
const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.socket?.remoteAddress || '';

// Enough to tell networks apart, not enough to pinpoint anyone
const maskIp = (ip) => {
  const v = String(ip).replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v)) return `${v.split('.').slice(0, 2).join('.')}.*.*`;
  if (v.includes(':')) return `${v.split(':').slice(0, 2).join(':')}:…`;
  return '';
};

const deviceOf = (ua = '') => {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Android phone' : 'Android tablet')
      : /Windows/.test(ua) ? 'Windows computer' : /Mac OS X/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'Chromebook'
        : /Linux/.test(ua) ? 'Linux computer' : 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'browser';
  return `${os} · ${browser}`;
};

// Recording must never stop someone signing in, so failures are only logged
const record = (req, fields) => SecurityEvent.create({ ip: maskIp(clientIp(req)), device: deviceOf(req.headers['user-agent']), ...fields })
  .catch((e) => console.error('Security record failed:', e.message));

// A change made by a signed-in officer to someone's account
const recordAction = async (req, type, target, detail, alert = false) => {
  const actor = await User.findById(req.user.id, { name: 1 }).lean().catch(() => null);
  return record(req, {
    kind: 'action', type, alert, detail, actorId: req.user.id, actorName: actor?.name || '',
    userId: target?._id?.toString() || target?.id, name: target?.name, email: target?.email,
  });
};

// Serious events are also emailed to every active admin
const alertAdmins = async (subject, lines) => {
  const admins = await User.find({ status: 'active', roles: 'admin' }, { email: 1 }).lean().catch(() => []);
  if (admins.length) emailService.sendSecurityAlert(admins.map((a) => a.email), subject, lines);
};

module.exports = { record, recordAction, alertAdmins, deviceOf, maskIp, PRIVILEGED: ['admin', 'president'] };
