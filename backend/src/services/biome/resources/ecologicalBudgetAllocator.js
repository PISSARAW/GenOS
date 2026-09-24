'use strict';

const { RESOURCE_KEYS } = require('../constants');
const { createResourceVector } = require('../contracts/resourceVector');

function allocateBudget({ available, populations, niches }) {
  const budget = createResourceVector(available);
  const allocation = Object.fromEntries(populations.map((population) => [population.populationId, createResourceVector()]));
  const unmetMinimums = {};
  for (const key of RESOURCE_KEYS) {
    const result = allocateResource({ key, amount: budget[key], populations, niches });
    Object.assign(unmetMinimums, result.unmet ? { [key]: result.unmet } : {});
    for (const [populationId, amount] of Object.entries(result.allocations)) allocation[populationId][key] = amount;
  }
  return { budget, allocations: allocation, unmetMinimums };
}

function allocateResource({ key, amount, populations, niches }) {
  const entries = eligiblePopulations(populations, niches, key);
  const minimumTotal = entries.reduce((sum, entry) => sum + entry.minimum, 0);
  const minimumScale = minimumTotal > amount && minimumTotal > 0 ? amount / minimumTotal : 1;
  const allocations = Object.fromEntries(entries.map((entry) => [entry.populationId, entry.minimum * minimumScale]));
  let remaining = Math.max(0, amount - Math.min(amount, minimumTotal));
  entries.sort((left, right) => right.score - left.score || left.populationId.localeCompare(right.populationId));
  for (const entry of entries) {
    const preferred = Math.min(entry.preferred, entry.maximum);
    const extra = Math.min(Math.max(0, preferred - allocations[entry.populationId]), remaining);
    allocations[entry.populationId] += extra;
    remaining -= extra;
  }
  return { allocations, unmet: Math.max(0, minimumTotal - amount) };
}

function eligiblePopulations(populations, niches, key) {
  return populations.filter((population) => !['dormant', 'extinct'].includes(population.status)).map((population) => {
    const niche = niches.find((item) => item.nicheId === population.nicheId);
    const profile = niche?.resourceProfile?.[key] || {};
    const current = population.resourcePool[key] || 0;
    return { populationId: population.populationId,
      minimum: Math.max(0, (profile.minimum || 0) - current),
      preferred: Math.max(0, (profile.preferred || 0) - current),
      maximum: Math.max(0, (profile.maximum ?? Number.MAX_SAFE_INTEGER) - current),
      score: niche?.opportunityScore || 0,
      eligible: Boolean(niche && ['open', 'colonized', 'saturated', 'declining'].includes(niche.status)) };
  }).filter((entry) => entry.eligible);
}

module.exports = { allocateBudget };
