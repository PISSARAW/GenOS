'use strict';

/**
 * SubstrateCost : table de coûts CPU/GPU/mémoire/IO/contexte/tools.
 */

const COSTS = {
  cpu_ms: 0.001, gpu_ms: 0.01, memory_mb: 0.0005, io_op: 0.002,
  context_token: 0.00002, tool_call: 0.05, model_frontier_call: 1.0, model_local_call: 0.1
};

function costOf(opts) {
  const o = opts || {};
  const usage = o.usage || {};
  let total = 0;
  for (const k of Object.keys(COSTS)) {
    total += (Number(usage[k]) || 0) * COSTS[k];
  }
  return { total, breakdown: usage, table: COSTS };
}

module.exports = { costOf, COSTS };
