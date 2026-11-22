// System accounts: accounts on the choir site's own domain (e.g. admin@avcsb.com) run the website.
// The person behind one is a chorister with their own member account; the system account itself is
// not a member: it is left out of member lists, attendance, dues, elections, birthdays and rosters.
const DOMAIN = String(process.env.SYSTEM_ACCOUNT_DOMAIN || 'avcsb.com').toLowerCase();
const isSystem = (u) => String(u?.email || '').toLowerCase().endsWith(`@${DOMAIN}`);
module.exports = { isSystem, DOMAIN };
