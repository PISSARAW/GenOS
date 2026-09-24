'use strict';

const { createNiche } = require('../contracts/niche');

function upsertNiche(niches, value) {
  const niche = createNiche(value);
  const existing = Array.isArray(niches) ? niches : [];
  const index = existing.findIndex((item) => item.nicheId === niche.nicheId);
  if (index < 0) return [...existing, niche];
  return existing.map((item, itemIndex) => itemIndex === index ? niche : item);
}

module.exports = { upsertNiche };
