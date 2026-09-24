'use strict';

const rhizomeTick = require('./rhizomeTick');

async function run(input) {
  if (!Array.isArray(input.needs)) {
    throw Object.assign(new Error('Rhizome runtime requires an ordered needs array.'), { code: 'RHIZOME_RUNTIME_NEEDS_REQUIRED' });
  }
  const maximum = Math.max(1, Math.min(100, Number(input.maxTicks) || input.needs.length || 1));
  const results = [];
  for (const need of input.needs.slice(0, maximum)) {
    const result = await rhizomeTick.tick({ ...input, need });
    results.push(result);
    if (await stopRequested(input.stopWhen, result)) return { results, stopReason: 'STOP_CONDITION' };
  }
  return { results, stopReason: input.needs.length > maximum ? 'MAX_TICKS' : 'NEEDS_EXHAUSTED' };
}

async function stopRequested(stopWhen, result) {
  return typeof stopWhen === 'function' && Boolean(await stopWhen(result));
}

module.exports = { run };
