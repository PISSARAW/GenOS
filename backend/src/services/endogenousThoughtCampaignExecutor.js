'use strict';

// Adapter contract for the ETT campaign.
// A full implementation must, for each (seed, scenarioClass, condition):
//   1. create a scoped project + SHEV responsibility + observation;
//   2. run detection -> admission -> queue -> runner -> verification -> learning -> continuation;
//   3. measure episodes, verifiedDiscoveries, normalizedCost, budgetViolations, duplicates.
// This module currently provides a deterministic placeholder so the campaign pipeline
// can run end-to-end while the real executor is being wired (see TODO below).

async function execute(input) {
  const { condition, caseId } = input || {};
  // TODO: replace with real ETT chain execution under condition.
  const full = condition === 'full';
  return {
    success: true,
    episodes: 1,
    verifiedDiscoveries: full ? 1 : 0,
    normalizedCost: 1,
    budgetViolations: 0,
    duplicates: 0,
    condition,
    caseId
  };
}

module.exports = { execute };