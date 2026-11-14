const mongoose = require('mongoose');

// A private message between two members. Only those two (and the admin, when reviewing chats) can read it.
const DirectMessageSchema = new mongoose.Schema({
  pair: { type: String, index: true }, // the two user ids, sorted and joined with ":"
  from: { type: String, index: true },
  to: { type: String, index: true },
  text: String,
  read: { type: Boolean, default: false },
}, { timestamps: { createdAt: true, updatedAt: false } });

DirectMessageSchema.index({ to: 1, read: 1 });

module.exports = mongoose.model('DirectMessage', DirectMessageSchema);
