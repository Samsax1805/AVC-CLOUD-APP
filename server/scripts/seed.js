// Makes one person the system administrator (full access, can grant executive roles).
// Usage: npm run seed -- <email> ["Full Name"]
//   - existing account: 'admin' is added to its roles; the password is left alone
//   - new account: created with ADMIN_PASSWORD from the environment, or a random
//     password printed once (change it after first login)
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const User = require('../models/User');

const [email, name = 'System Administrator'] = process.argv.slice(2);

(async () => {
  if (!email || !email.includes('@')) {
    console.error('Usage: npm run seed -- <email> ["Full Name"]');
    process.exit(1);
  }
  try {
    await connectDB();
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      const roles = [...new Set([...(existing.roles || []).filter((r) => r !== 'member'), 'admin'])];
      await User.updateOne({ _id: existing._id }, { $set: { roles, status: 'active' } });
      console.log(`✅ ${existing.name} <${existing.email}> is now an administrator (roles: ${roles.join(', ')})`);
    } else {
      const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
      await User.create({
        name, email: email.toLowerCase(), passwordHash: bcrypt.hashSync(password, 10),
        roles: ['admin'], status: 'active', provider: 'local',
      });
      console.log(`✅ Created administrator ${name} <${email.toLowerCase()}>`);
      if (!process.env.ADMIN_PASSWORD) console.log(`   Temporary password: ${password}  (shown once; change it after logging in)`);
    }
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    process.exit(1);
  }
})();