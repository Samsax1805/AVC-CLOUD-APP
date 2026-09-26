// [FIX] The old backend died at startup because it REQUIRED MongoDB.
// This store is dependency-free: data lives in memory and persists to
// server/data/db.json, so the whole program runs with zero external services.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function seedUsers() {
  const hash = bcrypt.hashSync('demo123', 10); // demo password for ALL seeded accounts
  const mk = (id, name, email, roles, section) => ({
    id, name, email, roles, section, phone: '', avatar: null,
    status: 'active', passwordHash: hash, joined: new Date().toISOString(),
  });
  return [
    mk('u1', 'Adaeze Okafor', 'admin@choircloud.com', ['admin'], 'Alto'),
    mk('u2', 'Tunde Bakare', 'president@choircloud.com', ['president'], 'Tenor'),
    mk('u3', 'Grace Eze', 'secretary@choircloud.com', ['secretary'], 'Soprano'),
    mk('u4', 'Samuel Adeyemi', 'provost@choircloud.com', ['provost'], 'Bass'),
    mk('u5', 'Ruth Chukwu', 'custodian@choircloud.com', ['custodian'], 'Alto'),
    mk('u6', 'David Olawale', 'electoral@choircloud.com', ['electoral'], 'Tenor'),
    mk('u7', 'Miriam Bello', 'miriam@choircloud.com', ['member'], 'Soprano'),
  ];
}

let db = { users: [], state: {} };
function save() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
  catch (e) { console.error('DB save failed:', e.message); }
}
function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (raw && Array.isArray(raw.users) && raw.users.length) db = raw; else throw new Error('bad');
  } catch { db = { users: seedUsers(), state: {} }; save(); }
}
load();
module.exports = { db, save };