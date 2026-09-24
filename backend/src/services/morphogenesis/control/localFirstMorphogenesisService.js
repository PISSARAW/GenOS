'use strict';

async function attemptAtLevel(level, context, repair) {
  const result = await repair(level, context);
  return result && result.valid === true ? { repaired: true, level, result } : null;
}

async function repairSmallestRegion(context, adapters) {
  const levels = ['node', 'parent', 'global'];
  for (const level of levels) {
    const outcome = await attemptAtLevel(level, context, adapters.repair);
    if (outcome) return outcome;
  }
  return { repaired: false, level: null, result: null };
}

module.exports = { repairSmallestRegion };
