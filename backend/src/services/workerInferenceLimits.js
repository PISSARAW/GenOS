'use strict';
const { digest, failure } = require('./trinityProvenanceValues');
function positive(value, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw failure('WORKER_INFERENCE_LIMIT_INVALID');
  }
  return value;
}
function resolve(mission) {
  const raw = mission.executionPolicy?.inferenceLimits;
  if (raw === undefined) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw failure('WORKER_INFERENCE_LIMIT_INVALID');
  const limits = { attempts: positive(raw.attempts, 26), outputTokens: positive(raw.outputTokens, 8192) };
  if (raw.reasoningEffort !== undefined) {
    if (!['none', 'low', 'medium', 'high', 'max'].includes(raw.reasoningEffort)) {
      throw failure('WORKER_INFERENCE_LIMIT_INVALID');
    }
    limits.reasoningEffort = raw.reasoningEffort;
  }
  return limits;
}
function authorityBinding(mission) {
  const limits = resolve(mission);
  return limits ? { workerInferenceLimitsHash: digest(limits) } : {};
}
function policyFields(mission) {
  const limits = resolve(mission);
  return limits ? { inferenceLimits: limits } : {};
}
function assertAuthority(envelope, mission) {
  if (envelope.workerInferenceLimitsHash !== authorityBinding(mission).workerInferenceLimitsHash) {
    throw failure('EXECUTION_AUTHORITY_CONTEXT_CHANGED');
  }
}
module.exports = { resolve, policyFields, authorityBinding, assertAuthority };
