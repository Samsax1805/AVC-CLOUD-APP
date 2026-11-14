const mongoose = require('mongoose');

// One day on the responsorial psalmist roster. Members only ever see published days.
const PsalmDaySchema = new mongoose.Schema({
  date: { type: String, index: true }, // YYYY-MM-DD
  title: String,
  rank: String, // Sunday, Solemnity, Feast, Weekday, Event, …
  season: String,
  color: String, // vestment colour name
  cycle: String, // e.g. "Year A", "Weekday Year II"
  psalmistIds: [String],
  note: String,
  published: { type: Boolean, default: false },
  publishedAt: Date,
  publishedBy: String,
  reminders: [String], // "<userId>:14" and "<userId>:7" once each reminder has gone out
  updatedBy: String,
}, { timestamps: true });

module.exports = mongoose.model('PsalmDay', PsalmDaySchema);
