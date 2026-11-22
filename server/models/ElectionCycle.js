const mongoose = require('mongoose');

// One election from start to finish, run by the Electoral Committee:
//   setup       committee picks the offices and who is eligible for each (members can't see it yet)
//   nominations published: members nominate eligible members for each office
//               members may also volunteer themselves for an office
//               (the committee may skip this and choose the candidates straight from the eligible list)
//   review      committee picks the final candidates
//   ballot      candidates published; waiting for the go-live button
//   live        voting open; live results seen only by the committee, President and admin
//   closed      voting over; results not yet released. A tied office can go to a run-off round
//               between the tied candidates (back to ballot, only those offices vote again)
//   published   results released to every member
//   archived    kept for history once a new election starts
// Votes are secret Ballots (records.js) keyed per office and round, so who chose whom never leaves the server.
// A mock (practice) election works the same way but is labelled as practice and never kept in history.
const STAGES = ['setup', 'nominations', 'review', 'ballot', 'live', 'closed', 'published', 'archived'];

const Round = new mongoose.Schema({
  round: Number,
  turnout: Number,
  results: [{ _id: false, id: String, votes: Number }],
}, { _id: false });

const Office = new mongoose.Schema({
  name: { type: String, required: true },
  eligibleIds: [String],
  candidateIds: [String],
  round: { type: Number, default: 1 },
  settled: { type: Boolean, default: false }, // not part of the current run-off round
  rounds: [Round], // earlier rounds' results, kept when a tie goes to a run-off
}, { _id: false });

const Nomination = new mongoose.Schema({
  office: String,
  nomineeId: String,
  byId: String,
  at: Date,
}, { _id: false });

// A member putting themselves forward for an office while nominations are open
const Volunteer = new mongoose.Schema({
  office: String,
  userId: String,
  at: Date,
}, { _id: false });

const ElectionCycle = new mongoose.Schema({
  title: { type: String, required: true },
  mock: { type: Boolean, default: false },
  stage: { type: String, enum: STAGES, default: 'setup', index: true },
  skippedNominations: { type: Boolean, default: false },
  runoff: { type: Number, default: 0 }, // 0 = first round; 2, 3… = run-off round in progress or done
  offices: [Office],
  nominations: [Nomination],
  volunteers: [Volunteer],
  // When each stage began and who moved it there
  history: [{ _id: false, stage: String, note: String, at: Date, byId: String, byName: String }],
  createdById: String,
}, { timestamps: true });

module.exports = mongoose.model('ElectionCycle', ElectionCycle);
module.exports.STAGES = STAGES;
