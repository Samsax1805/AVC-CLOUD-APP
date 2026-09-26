require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const User = require('../models/User');

const users = [
  ['Adaeze Okafor', 'admin@choircloud.com', ['admin'], 'Alto'],
  ['Tunde Bakare', 'president@choircloud.com', ['president'], 'Tenor'],
  ['Grace Eze', 'secretary@choircloud.com', ['secretary'], 'Soprano'],
  ['Samuel Adeyemi', 'provost@choircloud.com', ['provost'], 'Bass'],
  ['Ruth Chukwu', 'custodian@choircloud.com', ['custodian'], 'Alto'],
  ['David Olawale', 'electoral@choircloud.com', ['electoral'], 'Tenor'],
  ['Miriam Bello', 'miriam@choircloud.com', ['member'], 'Soprano'],
];

(async () => {
  try {
    await connectDB();
    const hash = bcrypt.hashSync('demo123', 10);
    
    for (const [name, email, roles, section] of users) {
      await User.updateOne(
        { email }, 
        {
          // [FIX] $set forces MongoDB to update existing records.
          // This repairs old admin accounts that are missing the 'section' field.
          $set: { 
            name, 
            roles, 
            section, 
            status: 'active',
            passwordHash: hash // Ensures the password is always reset to 'demo123'
          },
          // $setOnInsert is only used for fields we want to set strictly on creation
          $setOnInsert: { 
            email 
          }
        }, 
        { upsert: true }
      );
    }
    
    console.log('✅ Demo users seeded and repaired successfully (password: demo123)');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    process.exit(1);
  }
})();