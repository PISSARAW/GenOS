'use strict';

function positiveLimit(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 10000) {
    throw Object.assign(new Error('Biome tick limit must be an integer in [1, 10000].'), {
      code: 'BIOME_TICK_LIMIT_INVALID'
    });
  }
  return value;
}

function stopReason(runtime, options) {
  if (runtime.stopCondition) return runtime.stopCondition;
  if (options.signal?.aborted) return 'cancelled';
  if (Number.isFinite(options.deadline) && Date.now() >= options.deadline) return 'deadline_reached';
  if (runtime.tick >= runtime.maxTicks) return 'max_ticks_reached';
  return null;
}

function ecologicalStop(session, measurements) {
  const runtime = session.ecology.ecologicalState.runtime;
  if (runtime.goalVerification?.verified === true) return 'goal_achieved';
  if (runtime.budgetTotal !== undefined && runtime.budgetUsed >= runtime.budgetTotal) return 'budget_exhausted';
  if (measurements.populations.count > 0 && measurements.populations.extinct === measurements.populations.count) return 'extinction_event';
  const generations = session.variantState.generationHistory || [];
  if (generations.length >= 5 && generations.slice(-5).every(item => !item.promoted)) return 'sterility_limit';
  if (runtime.tick >= runtime.maxTicks) return 'max_ticks_reached';
  return null;
}

module.exports = { positiveLimit, stopReason, ecologicalStop };
