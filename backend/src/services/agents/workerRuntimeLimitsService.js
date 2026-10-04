'use strict';

const NEEDS_DETERMINISTIC_RUNNER = new Set(['procedural_executor', 'formal_worker']);

function assertWorkerExecutorAvailable(mission) {
  const kind = mission.workerKind;
  if (!NEEDS_DETERMINISTIC_RUNNER.has(kind)) return;
  throw Object.assign(new Error(`Worker kind '${kind}' requires a deterministic runner that is not connected to mission execution.`), {
    code: 'WORKER_EXECUTOR_UNAVAILABLE', workerKind: kind
  });
}

function cappedValue(requested, ceiling) {
  if (!Number.isFinite(requested) || requested <= 0) return ceiling;
  return Math.min(requested, ceiling);
}

function applyWorkerRuntimeLimits(mission, budget) {
  const resources = mission.workerContract?.resources;
  if (!resources) return budget;
  const bounded = { ...budget };
  if (Number.isFinite(resources.maxTokens)) {
    if (resources.maxTokens <= 0) assertWorkerExecutorAvailable(mission);
    bounded.tokens = cappedValue(budget.tokens, resources.maxTokens);
  }
  if (Number.isFinite(resources.maxTimeMs) && resources.maxTimeMs > 0) {
    bounded.latencyMs = cappedValue(budget.latencyMs, resources.maxTimeMs);
    mission.timeoutMs = cappedValue(mission.timeoutMs, resources.maxTimeMs);
  }
  mission.executionBudget = { ...(mission.executionBudget || {}), tokens: bounded.tokens, latencyMs: bounded.latencyMs };
  return bounded;
}

module.exports = { assertWorkerExecutorAvailable, applyWorkerRuntimeLimits };
