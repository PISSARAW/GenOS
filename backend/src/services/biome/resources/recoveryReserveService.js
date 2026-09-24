'use strict';

const { createResourceVector } = require('../contracts/resourceVector');

function reserveResources(available, ratio = 0.1) {
  const ratios = reserveRatios(ratio);
  const total = createResourceVector(available);
  const reserves = Object.fromEntries(Object.entries(ratios).map(([name, value]) => [name,
    Object.fromEntries(Object.entries(total).map(([key, amount]) => [key, amount * value]))]));
  const reserve = Object.fromEntries(Object.keys(total).map((key) => [key,
    Object.values(reserves).reduce((sum, vector) => sum + vector[key], 0)]));
  const spendable = Object.fromEntries(Object.entries(total).map(([key, amount]) => [key, amount - reserve[key]]));
  return { reserve, reserves, spendable };
}

function reserveRatios(input) {
  if (Number.isFinite(input)) return { recovery: validRatio(input) };
  const ratios = { recovery: validRatio(input?.recovery ?? 0.1), verification: validRatio(input?.verification ?? 0), exploration: validRatio(input?.exploration ?? 0) };
  if (Object.values(ratios).reduce((sum, value) => sum + value, 0) > 1) {
    throw Object.assign(new Error('Combined reserve ratios must not exceed 1.'), { code: 'BIOME_RESERVE_RATIO_INVALID' });
  }
  return ratios;
}

function validRatio(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw Object.assign(new Error('Reserve ratios must be between 0 and 1.'), { code: 'BIOME_RESERVE_RATIO_INVALID' });
  }
  return value;
}

function releaseReserve(ecology, category = 'recovery') {
  const categories = { recovery: 'recoveryReserve', verification: 'verificationReserve', exploration: 'explorationReserve' };
  const field = categories[category];
  if (!field) throw Object.assign(new Error(`Unknown reserve category '${category}'.`), { code: 'BIOME_RESERVE_CATEGORY_INVALID' });
  const reserve = ecology.ecologicalState[field] || {};
  const available = Object.fromEntries(Object.keys(ecology.resourcePool).map((key) => [key, ecology.resourcePool[key] + (reserve[key] || 0)]));
  ecology.resourcePool = createResourceVector(available);
  ecology.ecologicalState[field] = createResourceVector();
  return ecology.resourcePool;
}

module.exports = { reserveResources, releaseReserve };
