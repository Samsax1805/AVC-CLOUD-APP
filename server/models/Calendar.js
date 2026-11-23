const mongoose = require('mongoose');

// Choir calendar: rehearsals, services, meetings and other events (a weekly rehearsal is a series)
const EventSchema = new mongoose.Schema({
  date: { type: String, index: true }, // YYYY-MM-DD
  start: String, // HH:MM
  end: String,
  title: String,
  type: { type: String, enum: ['rehearsal', 'service', 'meeting', 'social', 'other'], default: 'other' },
  place: String,
  notes: String,
  seriesId: String, // events created together as "every week"
  createdById: String,
  createdByName: String,
}, { timestamps: true });

// Songs for one day, picked from the Music Library in order; members see it once published
const SetlistSchema = new mongoose.Schema({
  date: { type: String, unique: true }, // YYYY-MM-DD
  title: String,
  items: [{ _id: false, songId: String, label: String, note: String }],
  notes: String,
  published: { type: Boolean, default: false },
  publishedAt: Date,
  updatedById: String,
  updatedByName: String,
}, { timestamps: true });

module.exports = {
  Event: mongoose.model('Event', EventSchema),
  Setlist: mongoose.model('Setlist', SetlistSchema),
};
