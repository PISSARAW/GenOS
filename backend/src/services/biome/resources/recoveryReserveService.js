'use strict';

const { createResourceVector } = require('../contracts/resourceVector');

function reserveResources(available, ratio = 0.1) {
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    throw Object.assign(new Error('Recovery reserve ratio must be between 0 and 1.'), { code: 'BIOME_RESERVE_RATIO_INVALID' });
  }
  const total = createResourceVector(available);
  const reserve = Object.fromEntries(Object.entries(total).map(([key, amount]) => [key, amount * ratio]));
  const spendable = Object.fromEntries(Object.entries(total).map(([key, amount]) => [key, amount - reserve[key]]));
  return { reserve, spendable };
}

function releaseReserve(ecology) {
  const reserve = ecology.ecologicalState.recoveryReserve || {};
  const available = Object.fromEntries(Object.keys(ecology.resourcePool).map((key) => [key, ecology.resourcePool[key] + (reserve[key] || 0)]));
  ecology.resourcePool = createResourceVector(available);
  ecology.ecologicalState.recoveryReserve = createResourceVector();
  return ecology.resourcePool;
}

module.exports = { reserveResources, releaseReserve };
