'use strict';

const rhizomeTick = require('./rhizomeTick');
const homeostasisController = require('./homeostasisController');
const rhizome = require('../../rhizomeCoordinationService');

async function run(input) {
  if (!Array.isArray(input.needs)) {
    throw Object.assign(new Error('Rhizome runtime requires an ordered needs array.'), { code: 'RHIZOME_RUNTIME_NEEDS_REQUIRED' });
  }
  const maximum = Math.max(1, Math.min(100, Number(input.maxTicks) || input.needs.length || 1));
  const results = [];
  const homeostasis = homeostasisController.create();
  let activeVariant = input.variant || null;
  for (const need of input.needs.slice(0, maximum)) {
    const result = await rhizomeTick.tick({ ...input, need });
    result.homeostasis = homeostasis.observe(result, input);
    activeVariant = await applyVariant(input, activeVariant, result.homeostasis);
    results.push(result);
    if (await stopRequested(input.stopWhen, result)) return { results, stopReason: 'STOP_CONDITION' };
  }
  return { results, stopReason: input.needs.length > maximum ? 'MAX_TICKS' : 'NEEDS_EXHAUSTED' };
}

async function applyVariant(input, activeVariant, homeostasis) {
  if (input.dynamicVariants === false || activeVariant === homeostasis.recommendedVariant) return activeVariant;
  await rhizome.setVariant(input.sessionId, homeostasis.recommendedVariant, input.options || {});
  homeostasis.activeVariant = homeostasis.recommendedVariant;
  return homeostasis.recommendedVariant;
}

async function stopRequested(stopWhen, result) {
  return typeof stopWhen === 'function' && Boolean(await stopWhen(result));
}

module.exports = { run };
