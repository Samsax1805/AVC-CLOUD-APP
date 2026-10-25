const mongoose = require('mongoose');

// Stores password-reset codes. Each code expires after 15 minutes.
const ResetCodeSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, index: true },
  codeHash: { type: String, required: true }, // hashed so even if DB leaks, codes are safe
  expiresAt: { type: Date, required: true, index: { expires: 0 } }, // auto-deletes after expiry
  attempts: { type: Number, default: 0 }, // wrong guesses; the code is cancelled after 5
}, { timestamps: true });

module.exports = mongoose.model('ResetCode', ResetCodeSchema);