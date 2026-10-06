'use strict';

const { ALWAYS_NATIVE, hasNativeMethod, assertNativeInput } = require('./workerExecutorRegistry');

function methodFor(mission) {
  return mission.methodContract || mission.workerContract?.mission?.methodContract;
}

function isDeterministicWorkerMission(mission) {
  return ALWAYS_NATIVE.has(mission.workerKind) || hasNativeMethod(mission.workerKind, methodFor(mission)?.methodId);
}

function assertWorkerExecutorAvailable(mission) {
  if (isDeterministicWorkerMission(mission)) assertNativeInput(mission.workerKind, methodFor(mission));
}

function cappedValue(requested, ceiling) {
  if (!Number.isFinite(requested) || requested <= 0) return ceiling;
  return Math.min(requested, ceiling);
}

function applyWorkerRuntimeLimits(mission, budget) {
  const resources = mission.workerContract?.resources;
  if (!resources) return budget;
  const bounded = { ...budget };
  const native = isDeterministicWorkerMission(mission);
  if (native) {
    assertWorkerExecutorAvailable(mission);
    bounded.tokens = 0;
  } else if (Number.isFinite(resources.maxTokens)) {
    bounded.tokens = cappedValue(budget.tokens, resources.maxTokens);
  }
  if (Number.isFinite(resources.maxTimeMs) && resources.maxTimeMs > 0) {
    bounded.latencyMs = cappedValue(budget.latencyMs, resources.maxTimeMs);
    mission.timeoutMs = cappedValue(mission.timeoutMs, resources.maxTimeMs);
  }
  mission.executionBudget = { ...(mission.executionBudget || {}), tokens: bounded.tokens, latencyMs: bounded.latencyMs };
  return bounded;
}

module.exports = { isDeterministicWorkerMission, assertWorkerExecutorAvailable, applyWorkerRuntimeLimits };
