// Request hygiene for every API call:
// - refuses database operators ($gt, $where…) and prototype keys (__proto__, constructor) anywhere in
//   the body or query, so a crafted request can't change what a database lookup means
// - adds security headers to every API answer
const BAD_KEY = /^\$|^(__proto__|constructor|prototype)$/;
const tainted = (v, depth = 0) => {
  if (!v || typeof v !== 'object' || depth > 40) return false;
  if (Array.isArray(v)) return v.some((x) => tainted(x, depth + 1));
  return Object.keys(v).some((k) => BAD_KEY.test(k) || tainted(v[k], depth + 1));
};

module.exports = (req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-store',
  });
  if (tainted(req.body) || tainted(req.query)) return res.status(400).json({ msg: 'Invalid request' });
  next();
};
