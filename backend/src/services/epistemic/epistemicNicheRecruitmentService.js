'use strict';

const { cognitiveBiocenose, DEFAULT_NICHES } = require('./epistemicBiocenoseService');
const { defaultCatalog } = require('./verifierCatalogService');

function recruitNiche(reviewers, catalog = defaultCatalog(), threshold = 0.3) {
  const census = cognitiveBiocenose(reviewers);
  if (!census.shouldRecruit || census.effectiveDiversity >= threshold) return { census, candidate: null };
  const occupied = new Set(reviewers.map((reviewer) => reviewer.niche || reviewer.type));
  const candidate = DEFAULT_NICHES.find((niche) => !occupied.has(niche) && catalog[niche]);
  return { census, candidate: candidate ? { type: candidate, ...catalog[candidate] } : null };
}

async function recruitAndExecute(input) {
  const recommendation = recruitNiche(input.reviewers, input.catalog, input.threshold);
  if (!recommendation.candidate || typeof input.execute !== 'function') return { ...recommendation, result: null };
  const result = await input.execute(recommendation.candidate);
  return { ...recommendation, result: result || null };
}

module.exports = { recruitNiche, recruitAndExecute };
