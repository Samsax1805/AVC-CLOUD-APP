// Emails every active admin when the nightly backup fails. Run from the server folder.
// Packages and models come from the server folder (the current folder when cron runs this)
const need = require('module').createRequire(`${process.cwd()}/`);
need('dotenv').config();
const mongoose = need('mongoose');
const User = need('./models/User');
const email = need('./services/email.service');

(async () => {
  const why = process.argv[2] || 'unknown reason';
  await mongoose.connect(process.env.MONGO_URI);
  const admins = await User.find({ status: 'active', roles: 'admin' }, { email: 1 }).lean();
  await email.sendSecurityAlert(admins.map((a) => a.email), 'The nightly database backup failed', [`Last night's backup of the choir database did not complete: ${why}.`, 'Earlier backups are still on the server and in S3. Ask the person who looks after the server to check /home/ubuntu/backups/backup.log.']);
  console.log(`${new Date().toISOString()} alert emailed to ${admins.length} admin(s)`);
  await mongoose.disconnect();
})().catch((e) => { console.error(`alert failed: ${e.message}`); process.exit(1); });
