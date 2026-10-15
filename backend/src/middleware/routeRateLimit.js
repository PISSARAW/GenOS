'use strict';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 120;
const MAX_BUCKETS = 10_000;
const buckets = new Map();

function rateLimitIdentity(req) {
  const identity = req.user?.keyId || req.user?.username || req.ip || req.socket?.remoteAddress || 'unknown';
  return `${identity}:${req.baseUrl}`;
}

function activeBucket(key, now) {
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) return { count: 1, resetAt: now + WINDOW_MS };
  bucket.count += 1;
  return bucket;
}

function ensureBucketCapacity(key, now) {
  if (buckets.has(key) || buckets.size < MAX_BUCKETS) return true;
  for (const [bucketKey, value] of buckets) if (now >= value.resetAt) buckets.delete(bucketKey);
  return buckets.size < MAX_BUCKETS;
}

function routeRateLimit(req, res, next) {
  const now = Date.now();
  const key = rateLimitIdentity(req);
  if (!ensureBucketCapacity(key, now)) {
    res.set('Retry-After', String(Math.ceil(WINDOW_MS / 1000)));
    return res.status(429).json({ error: { code: 'RATE_LIMITED' } });
  }
  const bucket = activeBucket(key, now);
  buckets.set(key, bucket);
  if (bucket.count > MAX_REQUESTS) {
    res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
    return res.status(429).json({ error: { code: 'RATE_LIMITED' } });
  }
  return next();
}

module.exports = { routeRateLimit };
