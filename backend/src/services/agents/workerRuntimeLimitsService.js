'use strict';

const NEEDS_DETERMINISTIC_RUNNER = new Set(['procedural_executor', 'formal_worker']);

function assertWorkerExecutorAvailable(mission) {
  const kind = mission.workerKind;
  if (!NEEDS_DETERMINISTIC_RUNNER.has(kind)) return;
  const method = mission.methodContract || mission.workerContract?.mission?.methodContract;
  const methodId = String(method?.methodId || '').trim().toLowerCase();
  const supported = kind === 'procedural_executor'
    ? require('./deterministicWorkerProcedures').SUPPORTED.has(methodId)
    : ['formal_proof', 'theorem_proving'].includes(methodId);
  if (supported && method?.version === 1) {
    if (kind === 'formal_worker') require('./deterministicWorkerFormal').sourceFor(method.parameters);
    else if (method.parameters && typeof method.parameters === 'object') return;
    else throw unavailable(kind, methodId);
    return;
  }
  throw unavailable(kind, methodId);
}

function unavailable(kind, methodId) {
  return Object.assign(new Error(`Worker kind '${kind}' has no connected deterministic runner for '${methodId || 'unspecified'}'.`), {
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
