const mongoose = require('mongoose');

// A responsibility given to one member through the duty chat. `num` is the short number people type (#12).
const DutySchema = new mongoose.Schema({
  num: { type: Number, unique: true },
  title: String,
  due: String, // YYYY-MM-DD, optional
  assigneeId: { type: String, index: true },
  assigneeName: String,
  assignerId: { type: String, index: true },
  assignerName: String,
  status: { type: String, enum: ['assigned', 'accepted', 'declined', 'done', 'cancelled'], default: 'assigned' },
  history: [{ at: Date, byName: String, action: String, note: String }],
}, { timestamps: true });

module.exports = mongoose.model('Duty', DutySchema);
