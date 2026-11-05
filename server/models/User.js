const mongoose = require('mongoose');
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: String,
  googleId: String,
  avatar: String,
  roles: { type: [String], default: ['member'] },
  section: { type: String, default: null },
  dob: String,
  country: String,
  phone: String,
  provider: { type: String, default: 'local' },
  status: { type: String, enum: ['active', 'pending', 'deactivated'], default: 'active' },
  // Security: raising tokenVersion signs the account out everywhere; wrong passwords lock it for a while
  tokenVersion: { type: Number, default: 0 },
  failedLogins: { type: Number, default: 0 },
  lastFailedAt: Date,
  lockedUntil: Date,
  lastLoginAt: Date,
  knownDevices: [String],
}, { timestamps: true });
module.exports = mongoose.model('User', UserSchema);