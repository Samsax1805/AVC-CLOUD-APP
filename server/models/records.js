const mongoose = require('mongoose');
const { Schema, model } = mongoose;
const opts = { timestamps: true, strict: false };

const uidField = { type: String, unique: true, index: true };

const Song = model('Song', new Schema({ uid: uidField, title: String, part: String, format: String, size: String, duration: String, by: String, date: String, tag: String, cover: String, fileUrl: String }, opts));

const Session = model('Session', new Schema({
  uid: uidField, date: String, title: String,
  records: { type: Map, of: String },
  checkins: [{ userId: String, time: String, method: String }],
}, opts));

const Debt = model('Debt', new Schema({ uid: uidField, memberId: String, desc: String, amount: Number, paid: Number, date: String }, opts));

const Due = model('Due', new Schema({ uid: uidField, type: String, memberId: String, period: String, amount: Number, date: String, by: String }, opts));

const Election = model('Election', new Schema({
  uid: uidField, post: String, candidateIds: [String], status: String,
  votes: { type: Map, of: Number }, votedIds: [String], choice: { type: Map, of: String }, created: String,
}, opts));

const Minute = model('Minute', new Schema({ uid: uidField, title: String, body: String, date: String, by: String, roleAtTime: String }, opts));

const VoiceNote = model('VoiceNote', new Schema({ uid: uidField, title: String, duration: String, by: String, date: String, seed: Number, fileUrl: String }, opts));

const Receipt = model('Receipt', new Schema({ uid: uidField, title: String, amount: Number, category: String, date: String, by: String, fileUrl: String }, opts));

const Announcement = model('Announcement', new Schema({ uid: uidField, title: String, body: String, date: String, by: String, pinned: Boolean }, opts));

const ChoirDocument = model('ChoirDocument', new Schema({ uid: uidField, title: String, category: String, version: String, date: String, by: String, desc: String, fileUrl: String }, opts));

const Probation = model('Probation', new Schema({
  uid: uidField, memberId: String, reason: String, notes: String, start: String, end: String,
  by: String, roleAtTime: String, status: String,
  history: [{ ev: String, date: String, by: String, note: String }],
}, opts));

const AuditLog = model('AuditLog', new Schema({ uid: uidField, userId: String, role: String, action: String, detail: String, time: String }, opts));

const DuesSetting = model('DuesSetting', new Schema({ uid: uidField, amount: Number, effectiveFrom: String, by: String, roleAtTime: String }, opts));

const Notification = model('Notification', new Schema({ uid: uidField, text: String, date: String, readBy: [String] }, opts));

const Misc = model('Misc', new Schema({ key: { type: String, unique: true }, data: Schema.Types.Mixed }, opts));

module.exports = { Song, Session, Debt, Due, Election, Minute, VoiceNote, Receipt, Announcement, ChoirDocument, Probation, AuditLog, DuesSetting, Notification, Misc };