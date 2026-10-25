// Small in-memory rate limiter (one server process): blocks password guessing and sign-up spam.
// Usage: rateLimit({ windowMs: 15 * 60 * 1000, max: 10, name: 'login' })
module.exports = ({ windowMs, max, name }) => {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    // Nginx appends the real client address last; earlier entries can be forged by the client
    const ip = (req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.socket.remoteAddress || 'unknown';
    const key = `${name}:${ip}`;
    const now = Date.now();
    const cur = hits.get(key);
    const entry = cur && cur.reset > now ? cur : { count: 0, reset: now + windowMs };
    entry.count += 1;
    hits.set(key, entry);
    if (entry.count > max) {
      res.set('Retry-After', Math.ceil((entry.reset - now) / 1000));
      return res.status(429).json({ msg: 'Too many attempts — please wait a few minutes and try again.' });
    }
    next();
  };
};
