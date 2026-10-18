'use strict';

const { cognitiveBiocenose, DEFAULT_NICHES } = require('./epistemicBiocenoseService');
const { defaultCatalog } = require('./verifierCatalogService');

function recruitNiche(reviewers, catalog = defaultCatalog(), policy) {
  const census = cognitiveBiocenose(reviewers, policy);
  if (!census.shouldRecruit) return { census, candidate: null };
  const occupied = new Set(reviewers.map((reviewer) => reviewer.niche || reviewer.type));
  const candidate = DEFAULT_NICHES.find((niche) => !occupied.has(niche) && catalog[niche]);
  return { census, candidate: candidate ? { type: candidate, ...catalog[candidate] } : null };
}

async function recruitAndExecute(input) {
  const recommendation = recruitNiche(input.reviewers, input.catalog, input.diversityPolicy);
  if (!recommendation.candidate || typeof input.execute !== 'function') return { ...recommendation, result: null };
  const result = await input.execute(recommendation.candidate);
  return { ...recommendation, result: result || null };
}

module.exports = { recruitNiche, recruitAndExecute };
