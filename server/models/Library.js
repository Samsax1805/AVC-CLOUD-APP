const mongoose = require('mongoose');

// Choir Music & Instrument Library (design revision 4).
// A LibraryItem is one musical work from upload to archive. It keeps one internal id (uid) for life;
// what people see is its reference: Q-0042 while in the queue, CHR-0017 / INS-0004 once approved (stage B).
// Details are saved one field at a time; meta.<field> = { r, by, at } is that field's revision, used to spot
// two people changing the same field at once (the second is asked, nothing is overwritten silently).

// Permanent number sequences (queue numbers now, CHR / INS numbers in stage B). Numbers are never reused.
const Counter = mongoose.model('Counter', new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false }));

const FileSchema = new mongoose.Schema({
  fid: String, // this file's id within the item
  id: String, // storage id (files/<id>), empty for a link
  link: String, // a recording on YouTube, Drive…
  kind: String,
  part: String,
  version: Number,
  name: String,
  mime: String,
  size: Number,
  etag: String, // fingerprint given by the storage service
  by: String,
  byName: String,
  at: Date,
  binnedAt: Date,
}, { _id: false });

const LibraryItem = mongoose.model('LibraryItem', new mongoose.Schema({
  uid: { type: String, unique: true },
  ckey: { type: String, unique: true, sparse: true }, // the browser's own id for this upload, so a retried upload never makes two items
  qno: { type: Number, unique: true },
  status: { type: String, default: 'needs', index: true }, // needs · ready (stage A); more in stage B · removed
  existing: Boolean, // a song from before the catalogue (stage C)
  legacySongId: String,
  d: { type: mongoose.Schema.Types.Mixed, default: {} }, // the details (see controllers/library.controller.js FIELDS)
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  rev: { type: Number, default: 0 }, // goes up on every change; keeps the derived fields below in step
  done: { type: Number, default: 0 }, // required details completed (of 10)
  missing: [String],
  search: String, // lower-case words for the queue's search box
  files: [FileSchema],
  binned: [FileSchema], // removed files: the stored copy is kept for 30 days
  claim: { userId: String, name: String, at: Date },
  dupOf: String, // uid of an item holding the same file
  dupRef: String,
  dupDismissed: Boolean,
  mergedInto: String,
  createdBy: String,
  createdByName: String,
  history: [{ _id: false, at: Date, by: String, byName: String, ev: String, detail: String }],
}, { timestamps: true, minimize: false }).index({ status: 1, qno: 1 }).index({ 'files.etag': 1 }));

// Entries people typed into a list themselves ("+ Other"). Suggested to everyone, marked "added by members".
const LibraryTerm = mongoose.model('LibraryTerm', new mongoose.Schema({
  list: String,
  value: String,
  lower: String,
  uses: { type: Number, default: 0 },
  by: String,
  byName: String,
}, { timestamps: true }).index({ list: 1, lower: 1 }, { unique: true }));

const nextNumber = async (name) => (await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, new: true })).seq;

module.exports = { Counter, LibraryItem, LibraryTerm, nextNumber };
