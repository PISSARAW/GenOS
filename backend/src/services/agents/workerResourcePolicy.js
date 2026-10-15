'use strict';

const { workerPolicy } = require('./workerPolicyService');
const { hasNativeMethod } = require('./workerExecutorRegistry');
const DEFAULT_WORKER_TOKEN_LIMIT = 8000;
const COMMUNICATING_WORKER_TOKEN_LIMIT = 40000;

function tokenCeiling(policy, mission, native) {
  if (native) return 0;
  const requested = Number(mission.workerTokenLimit);
  const baseMaximum = policy.maxTokens ?? DEFAULT_WORKER_TOKEN_LIMIT;
  const policyMaximum = mission.communicationRequired === true
    ? Math.max(baseMaximum, COMMUNICATING_WORKER_TOKEN_LIMIT) : baseMaximum;
  const maximum = Number.isFinite(requested) && requested > 0
    ? policyMaximum : Math.min(policyMaximum, DEFAULT_WORKER_TOKEN_LIMIT);
  return Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), maximum) : maximum;
}

function delegationCeiling(policy, mission) {
  const policyMaximum = Number(policy.maxTokens);
  const maximum = Number.isSafeInteger(policyMaximum) && policyMaximum > 0 ? policyMaximum : 10000;
  const allocation = mission.delegatedTokenLimit ?? mission.workerTokenLimit;
  if (allocation === undefined) return 0;
  const requested = Number(allocation);
  return Number.isFinite(requested) && requested >= 0 ? Math.min(Math.floor(requested), maximum) : 0;
}

function workerResources(kind, mission = {}) {
  const policy = workerPolicy(kind);
  const native = policy.executionMode === 'deterministic' || hasNativeMethod(kind, mission.methodContract?.methodId);
  const maxTimeMs = policy.maxTimeMs ?? 300000;
  return { maxTokens: tokenCeiling(policy, mission, native),
    ...(kind === 'sub_orchestrator' && native ? { maxDelegatedTokens: delegationCeiling(policy, mission) } : {}),
    maxTimeMs, maxCpuMs: policy.maxCpuMs ?? maxTimeMs,
    executionMode: native ? 'deterministic' : 'model' };
}

module.exports = { workerResources };
