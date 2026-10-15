'use strict';

const rateLimit = require('express-rate-limit');

const routeRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED' } })
});

module.exports = { routeRateLimit };
