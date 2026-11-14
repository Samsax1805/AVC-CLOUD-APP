const mongoose = require('mongoose');

// One line in a member's private conversation with the duty assistant.
// Only that member (and the admin, in the chat logs) can read it.
const ChatMessageSchema = new mongoose.Schema({
  userId: { type: String, index: true }, // whose conversation
  from: { type: String, enum: ['user', 'bot'] },
  text: String,
  dutyNum: Number,
  read: { type: Boolean, default: false },
}, { timestamps: { createdAt: true, updatedAt: false } });

module.exports = mongoose.model('ChatMessage', ChatMessageSchema);
