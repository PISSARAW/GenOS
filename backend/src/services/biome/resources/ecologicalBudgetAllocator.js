'use strict';

const { RESOURCE_KEYS } = require('../constants');
const { createResourceVector } = require('../contracts/resourceVector');
const ecologicalValue = require('./ecologicalValueService');

function allocateBudget({ available, populations, niches, signals = {} }) {
  const budget = createResourceVector(available);
  const allocation = Object.fromEntries(populations.map((population) => [population.populationId, createResourceVector()]));
  const unmetMinimums = {};
  const populationValues = {};
  for (const key of RESOURCE_KEYS) {
    const result = allocateResource({ key, amount: budget[key], populations, niches, signals });
    Object.assign(unmetMinimums, result.unmet ? { [key]: result.unmet } : {});
    Object.assign(populationValues, result.values);
    for (const [populationId, amount] of Object.entries(result.allocations)) allocation[populationId][key] = amount;
  }
  return { budget, allocations: allocation, unmetMinimums, populationValues };
}

function allocateResource({ key, amount, populations, niches, signals }) {
  const entries = eligiblePopulations({ populations, niches, key, signals });
  const minimumTotal = entries.reduce((sum, entry) => sum + entry.minimum, 0);
  const minimumScale = minimumTotal > amount && minimumTotal > 0 ? amount / minimumTotal : 1;
  const allocations = Object.fromEntries(entries.map((entry) => [entry.populationId, entry.minimum * minimumScale]));
  let remaining = Math.max(0, amount - Math.min(amount, minimumTotal));
  remaining -= distribute({ entries, allocations, budget: remaining, target: 'preferred', weighted: false });
  remaining -= distribute({ entries, allocations, budget: remaining, target: 'maximum', weighted: true });
  return { allocations, unmet: Math.max(0, minimumTotal - amount), values: Object.fromEntries(entries.map((entry) => [entry.populationId, entry.value])) };
}

function distribute({ entries, allocations, budget, target, weighted }) {
  let remaining = budget;
  for (let round = 0; round < entries.length && remaining > 0; round += 1) {
    const pass = allocateRound({ entries, allocations, budget: remaining, target, weighted });
    remaining = Math.max(0, remaining - pass.granted);
    if (pass.granted === 0) break;
  }
  return budget - remaining;
}

function allocateRound({ entries, allocations, budget, target, weighted }) {
  const active = entries.filter((entry) => targetValue(entry, target) > allocations[entry.populationId]);
  if (!active.length) return { granted: 0 };
  const weightTotal = active.reduce((sum, entry) => sum + (weighted ? entry.value : 1), 0);
  if (weightTotal <= 0 && weighted) return { granted: 0 };
  const grants = active.map((entry) => calculateGrant({ entry, allocations, budget, target, weighted, weightTotal, count: active.length }));
  for (const grant of grants) allocations[grant.populationId] += grant.amount;
  return { granted: grants.reduce((sum, grant) => sum + grant.amount, 0) };
}

function calculateGrant({ entry, allocations, budget, target, weighted, weightTotal, count }) {
  const weight = weighted ? entry.value : 1;
  const share = weightTotal > 0 ? budget * weight / weightTotal : budget / count;
  const room = targetValue(entry, target) - allocations[entry.populationId];
  return { populationId: entry.populationId, amount: Math.min(room, share) };
}

function targetValue(entry, target) {
  return Math.min(entry[target], entry.maximum);
}

function eligiblePopulations({ populations, niches, key, signals }) {
  return populations.filter((population) => !['dormant', 'extinct'].includes(population.status)).map((population) => {
    const niche = niches.find((item) => item.nicheId === population.nicheId);
    const profile = niche?.resourceProfile?.[key] || {};
    const current = population.resourcePool[key] || 0;
    if (!niche) return null;
    const score = ecologicalValue.scorePopulation({ population, niche, overrides: signals[population.populationId] || {} });
    return { populationId: population.populationId,
      minimum: Math.max(0, (profile.minimum || 0) - current),
      preferred: Math.max(current, profile.preferred || 0),
      maximum: Math.max(current, profile.maximum ?? Number.MAX_SAFE_INTEGER),
      value: score.value,
      signals: score.signals,
      eligible: Boolean(niche && ['open', 'colonized', 'saturated', 'declining'].includes(niche.status)) };
  }).filter((entry) => entry?.eligible);
}

module.exports = { allocateBudget };
