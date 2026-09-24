'use strict';

const LOOP_ACTIONS = Object.freeze({
  fast: ['worker_rebind', 'budget_shift', 'communication_adjustment', 'spawn_verifier', 'pause_branch'],
  structural: ['nest', 'split', 'merge', 'topology_change', 'variant_change'],
  evolutionary: ['learn_pattern', 'mutate_prior', 'update_transition_policy', 'update_relation_prior']
});

function classifyAction(action) {
  for (const [loop, actions] of Object.entries(LOOP_ACTIONS)) {
    if (actions.includes(String(action).toLowerCase())) return loop;
  }
  return 'unknown';
}

function loopIsDue(loop, timing = {}) {
  const interval = timing.intervalMs;
  return Number.isFinite(interval) && interval >= 0 && timing.now - timing.lastRunAt >= interval;
}

module.exports = { LOOP_ACTIONS, classifyAction, loopIsDue };
