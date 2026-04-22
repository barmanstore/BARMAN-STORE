const createRateLimiter = ({ windowMs, max, keyFn }) => {
  const hits = new Map();
  let nextPruneAt = 0;

  const pruneExpiredHits = (now) => {
    if (now < nextPruneAt) return;
    for (const [hitKey, hitValue] of hits.entries()) {
      if (!hitValue || now > Number(hitValue.resetAt || 0)) {
        hits.delete(hitKey);
      }
    }
    const pruneIntervalMs = Math.max(1000, Math.min(Number(windowMs || 0) || 60000, 60000));
    nextPruneAt = now + pruneIntervalMs;
  };

  return (req, res, next) => {
    const now = Date.now();
    pruneExpiredHits(now);
    const key = String(keyFn(req) || 'unknown');
    const current = hits.get(key);
    if (!current || now > current.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (current.count >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    current.count += 1;
    return next();
  };
};

module.exports = { createRateLimiter };
