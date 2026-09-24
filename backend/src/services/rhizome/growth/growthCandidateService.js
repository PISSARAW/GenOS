'use strict';

const { normalizeGrowthCandidate } = require('../contracts/growthCandidate');

function normalizeCandidates(value) {
  if (!Array.isArray(value)) throw Object.assign(new Error('Growth candidates must be an array.'), { code: 'RHIZOME_GROWTH_INVALID' });
  const candidates = value.map(normalizeGrowthCandidate);
  const ids = candidates.map((item) => item.candidateId);
  if (new Set(ids).size !== ids.length) throw Object.assign(new Error('Duplicate growth candidate id.'), { code: 'RHIZOME_GROWTH_INVALID' });
  return candidates;
}

module.exports = { normalizeCandidates };
