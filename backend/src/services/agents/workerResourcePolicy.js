'use strict';

const { workerPolicy } = require('./workerPolicyService');
const { hasNativeMethod } = require('./workerExecutorRegistry');

function tokenCeiling(policy, mission, native) {
  if (native) return 0;
  const maximum = policy.maxTokens ?? 8000;
  const requested = Number(mission.workerTokenLimit);
  return Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), maximum) : maximum;
}

function workerResources(kind, mission = {}) {
  const policy = workerPolicy(kind);
  const native = policy.executionMode === 'deterministic' || hasNativeMethod(kind, mission.methodContract?.methodId);
  return { maxTokens: tokenCeiling(policy, mission, native),
    maxTimeMs: policy.maxTimeMs ?? 300000, maxCpuMs: policy.maxCpuMs ?? 60000,
    executionMode: native ? 'deterministic' : 'model' };
}

module.exports = { workerResources };
