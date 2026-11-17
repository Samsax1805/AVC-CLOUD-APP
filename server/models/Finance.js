const mongoose = require('mongoose');
const { Schema, model } = mongoose;

// An account book: the choir's account set up once by the Finance Secretary
//   base: the currency every total is also shown in (e.g. TL); each other currency has a rate to it
//   opening: each currency's balance at the start of the first month (startMonth, 'YYYY-MM')
const Currency = new Schema({ code: String, name: String, symbol: String, opening: Number, rate: Number }, { _id: false });
const FinanceBook = model('FinanceBook', new Schema({
  name: String,
  base: String,
  currencies: [Currency],
  incomeCats: [String],
  expenseCats: [String],
  funds: [String],
  startMonth: String,
  createdById: String,
}, { timestamps: true }));

// One month of a book. Its brought-forward balances are never stored: they are always worked out
// from the month before, so a correction to an earlier month carries through on its own.
//   draft    → the Finance Secretary is preparing it
//   review   → sent to the Secretary
//   returned → the Secretary sent it back with comments
//   published → approved; every member can read it and download the PDF
const Step = new Schema({ action: String, note: String, at: Date, byId: String, byName: String }, { _id: false });
const Version = new Schema({
  v: Number, at: Date, byId: String, byName: String, note: String,
  entries: [Schema.Types.Mixed], rates: Schema.Types.Mixed, ratesDate: String, members: [Schema.Types.Mixed], notes: String,
}, { _id: false });
const SheetSchema = new Schema({
  bookId: { type: String, index: true },
  month: String,
  status: { type: String, default: 'draft' },
  entries: [Schema.Types.Mixed],
  rates: Schema.Types.Mixed,
  ratesDate: String,
  members: [Schema.Types.Mixed],
  notes: String,
  rev: { type: Number, default: 1 },
  reviewNote: String,
  submittedAt: Date,
  publishedAt: Date,
  publishedById: String,
  publishedByName: String,
  preparedByName: String,
  history: [Step],
  versions: [Version],
  nextV: { type: Number, default: 1 },
}, { timestamps: true });
SheetSchema.index({ bookId: 1, month: 1 }, { unique: true });
const FinanceSheet = model('FinanceSheet', SheetSchema);

module.exports = { FinanceBook, FinanceSheet };
