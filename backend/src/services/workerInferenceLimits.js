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
  return { attempts: positive(raw.attempts, 26), outputTokens: positive(raw.outputTokens, 8192) };
}
function authorityBinding(mission) {
  const limits = resolve(mission);
  return limits ? { workerInferenceLimitsHash: digest(limits) } : {};
}
function assertAuthority(envelope, mission) {
  if (envelope.workerInferenceLimitsHash !== authorityBinding(mission).workerInferenceLimitsHash) {
    throw failure('EXECUTION_AUTHORITY_CONTEXT_CHANGED');
  }
}
module.exports = { resolve, authorityBinding, assertAuthority };
