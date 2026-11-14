// Express 4 does not catch errors thrown by async handlers: without this one failure would stop the whole API
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => {
  console.error(`${req.method} ${req.baseUrl}${req.path} failed:`, e.message);
  if (!res.headersSent) res.status(500).json({ msg: 'Something went wrong — please try again' });
});
