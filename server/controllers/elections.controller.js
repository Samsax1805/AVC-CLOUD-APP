const { Election, Ballot } = require('../models/records');

// Shape sent to browsers: vote totals only. Who chose whom stays in Ballots on the server;
// each member only learns their own choice.
const forMember = (e, myChoice) => {
  const { _id, __v, createdAt, updatedAt, choice, ...rest } = e;
  const votes = rest.votes instanceof Map ? Object.fromEntries(rest.votes) : (rest.votes || {});
  return { ...rest, id: rest.uid, votes, votedIds: rest.votedIds || [], choice: myChoice ? { [myChoice.userId]: myChoice.candId } : {} };
};

exports.forMember = forMember;

// All polls as the given member may see them
exports.listFor = async (userId) => {
  const [elections, mine] = await Promise.all([Election.find().lean(), Ballot.find({ userId }).lean()]);
  return elections.map((e) => forMember(e, mine.find((b) => b.electionId === e.uid)));
};

// GET /api/elections — polled by the Elections page so results update live
exports.list = async (req, res) => res.json(await exports.listFor(req.user.id));

// POST /api/elections/:id/vote { candId } — one secret ballot per active (non Old Member) member
exports.vote = async (req, res) => {
  const roles = req.user.roles || [];
  if (roles.includes('alumni')) return res.status(403).json({ msg: 'Old Members can follow elections but not vote' });
  const { candId } = req.body || {};
  const e = await Election.findOne({ uid: req.params.id }).lean();
  if (!e) return res.status(404).json({ msg: 'Poll not found' });
  if (e.status !== 'live') return res.status(400).json({ msg: 'This poll is not open for voting' });
  if (!(e.candidateIds || []).includes(candId)) return res.status(400).json({ msg: 'Unknown candidate' });
  try {
    await Ballot.create({ electionId: e.uid, userId: req.user.id, candId });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ msg: 'You have already voted in this poll' });
    throw err;
  }
  const updated = await Election.findOneAndUpdate(
    { uid: e.uid },
    { $inc: { [`votes.${candId}`]: 1 }, $addToSet: { votedIds: req.user.id } },
    { new: true },
  ).lean();
  res.json(forMember(updated, { userId: req.user.id, candId }));
};
