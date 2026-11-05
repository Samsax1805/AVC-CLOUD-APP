const mongoose = require('mongoose');

// Sign-ins and sensitive changes. Written only by the server, so no browser can add or edit them.
// MongoDB removes each record automatically after 90 days.
const SecurityEventSchema = new mongoose.Schema({
  kind: { type: String, enum: ['signin', 'action'], index: true },
  type: String, // signin: success, wrong_password, unknown_account, locked, blocked, pending, deactivated; action: member_added, role_granted, …
  method: String, // google, password, reset
  userId: { type: String, index: true },
  name: String,
  email: String,
  actorId: String,
  actorName: String,
  detail: String,
  ip: String, // partly hidden, e.g. 78.135.*.*
  device: String, // e.g. "iPhone · Safari"
  alert: { type: Boolean, default: false },
}, { timestamps: { createdAt: true, updatedAt: false } });

SecurityEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('SecurityEvent', SecurityEventSchema);
