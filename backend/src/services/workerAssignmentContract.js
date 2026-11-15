'use strict';

const kinds = require('./agents/workerKindService');
const executors = require('./agents/workerExecutorRegistry');
const DELEGABLE_KINDS = Object.freeze(Object.keys(kinds.KINDS)
  .filter((kind) => kind !== 'sub_orchestrator'));

const PROMPT_METHOD = Object.freeze({
  version: 1,
  methodId: 'prompt_defined',
  source: 'mission_prompt',
  requiredCapabilities: []
});

function methodFor(assignment) {
  return assignment.methodContract || assignment.workerAssignment?.methodContract || null;
}

function field(assignment, name) {
  return assignment[name] ?? assignment.workerAssignment?.[name] ?? null;
}

function nicheFor(assignment) {
  const parameters = methodFor(assignment)?.parameters || {};
  return ['specialtyNiche', 'nicheDomain', 'niche', 'domain']
    .map((name) => field(assignment, name) ?? parameters[name])
    .find((value) => typeof value === 'string' && value.trim()) || null;
}

function assertNativeMethod(kind, method) {
  if (!executors.ALWAYS_NATIVE.has(kind)) return;
  if (!method || !executors.hasNativeMethod(kind, method.methodId)) {
    throw Object.assign(new Error(`Worker kind '${kind}' requires a registered native method contract.`), {
      code: 'WORKER_NATIVE_METHOD_REQUIRED', workerKind: kind
    });
  }
}

function assertSpecialist(assignment, kind) {
  if (kind === 'specialist' && !nicheFor(assignment)) {
    throw Object.assign(new Error('Specialist assignments require an explicit niche.'), {
      code: 'SPECIALIST_NICHE_REQUIRED'
    });
  }
}

function assertSymbiotic(assignment, kind) {
  if (kind !== 'symbiotic_worker') return;
  const capabilities = field(assignment, 'hostCapabilities');
  if (!field(assignment, 'hostContractId') || !Array.isArray(capabilities) || !capabilities.length) {
    throw Object.assign(new Error('Symbiotic assignments require a host contract and explicit capabilities.'), {
      code: 'SYMBIOTIC_HOST_CONTRACT_REQUIRED'
    });
  }
}

function assertRecovery(assignment, kind, method) {
  if (kind !== 'recovery_worker' || method?.methodId !== 'restore_checkpoint') return;
  const lease = field(assignment, 'recoveryLease');
  if (lease?.action !== 'restore_checkpoint' || typeof lease.path !== 'string' || !lease.path.trim()) {
    throw Object.assign(new Error('Checkpoint recovery assignments require a matching recovery lease.'), {
      code: 'WORKER_RECOVERY_LEASE_REQUIRED'
    });
  }
}

function assertCompleteAssignment(assignment) {
  const kind = kinds.resolveWorkerKind(assignment?.workerKind, assignment?.role);
  const method = methodFor(assignment);
  assertNativeMethod(kind, method);
  kinds.assertMethodCompatibility(kind, method);
  if (method && executors.hasNativeMethod(kind, method.methodId)) executors.assertNativeInput(kind, method);
  assertSpecialist(assignment, kind);
  assertSymbiotic(assignment, kind);
  assertRecovery(assignment, kind, method);
  return true;
}

function preparePromptAssignment(assignment) {
  const kind = kinds.resolveWorkerKind(assignment?.workerKind, assignment?.role);
  const prepared = { ...assignment, workerKind: kind,
    methodContract: methodFor(assignment) || { ...PROMPT_METHOD } };
  assertCompleteAssignment(prepared);
  return prepared;
}

module.exports = { DELEGABLE_KINDS, PROMPT_METHOD, assertCompleteAssignment, preparePromptAssignment };
