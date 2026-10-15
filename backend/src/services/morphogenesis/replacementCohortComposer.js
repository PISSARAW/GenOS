'use strict';

const crypto = require('node:crypto');
const workerKinds = require('../agents/workerKindService');
const { workerToolLeaseForCapabilities } = require('../agentOrchestrationState');

const MAX_COHORT_WORKERS = 12;
const RUNNING_STATES = new Set(['running', 'queued', 'claimed', 'freezing', 'thawing', 'cancelling']);

function composeReplacementCohort(input) {
  validateBarrier(input);
  const mission = validateMission(input);
  const workers = input.blueprint.assignments.map((assignment, index) => buildReplacement({
    assignment, index, input, mission
  }));
  validateBudget(workers, input.remainingBudget.tokens);
  return {
    cohortId: cohortId(input), epoch: input.epoch, topology: input.topology,
    workers, retireWorkerIds: input.currentCohort.map((worker) => worker.id),
    budget: { allocatedTokens: workers.reduce((sum, worker) => sum + worker.tokenBudget, 0),
      remainingTokens: input.remainingBudget.tokens }
  };
}

function validateBarrier(input) {
  validateExecutionGate(input);
  validateCohortShape(input);
  validateIdentityAndBudget(input);
  validateAuthority(input);
  validateCurrentCohort(input);
}

function validateExecutionGate(input) {
  if (!input || input.quiescence?.confirmed !== true) throw failure('MORPHOGENESIS_QUIESCENCE_REQUIRED');
  if (input.topology === 'trinity' || input.executionPath === 'trinity') throw failure('TRINITY_USES_SEALED_PATH');
}

function validateCohortShape(input) {
  if (!Array.isArray(input.currentCohort) || !Array.isArray(input.blueprint?.assignments)) {
    throw failure('MORPHOGENESIS_COHORT_INPUT_INVALID');
  }
  if (input.blueprint.assignments.length < 1 || input.blueprint.assignments.length > MAX_COHORT_WORKERS) {
    throw failure('MORPHOGENESIS_COHORT_SIZE_INVALID');
  }
}

function validateIdentityAndBudget(input) {
  if (!Number.isSafeInteger(input.epoch) || input.epoch < 1 || !input.missionId || !input.topology) {
    throw failure('MORPHOGENESIS_COHORT_IDENTITY_INVALID');
  }
  if (!input.remainingBudget || !Number.isSafeInteger(input.remainingBudget.tokens) || input.remainingBudget.tokens < 0) {
    throw failure('MORPHOGENESIS_COHORT_BUDGET_INVALID');
  }
}

function validateAuthority(input) {
  if (!Array.isArray(input.parentAuthority?.allowedTools)) throw failure('MORPHOGENESIS_AUTHORITY_CEILING_REQUIRED');
}

function validateCurrentCohort(input) {
  for (const worker of input.currentCohort) {
    if (!worker.id || RUNNING_STATES.has(String(worker.status || '').toLowerCase())) {
      throw failure('MORPHOGENESIS_COHORT_NOT_QUIESCENT');
    }
  }
}

function validateMission(input) {
  const mission = input.mission || {};
  if (!mission.prompt && !mission.currentTask) throw failure('MORPHOGENESIS_MISSION_SCOPE_REQUIRED');
  return mission;
}

function buildReplacement(details) {
  const { assignment, index, input, mission } = details;
  const kind = workerKinds.resolveWorkerKind(assignment.workerKind, assignment.role);
  const tokenBudget = requestedBudget(assignment);
  const capabilities = stringSet(assignment.capabilities);
  const methodContract = assignment.methodContract || null;
  const workerAssignment = { ...assignment, workerKind: kind };
  const contract = workerKinds.buildWorkerContract(kind, {
    prompt: mission.prompt || mission.currentTask, orchestratorAgentId: input.parentId,
    methodContract, workerAssignment, workerTokenLimit: tokenBudget,
    writeLease: input.parentAuthority.write === true && mission.writeLease === true,
    communicationRequired: mission.communicationRequired === true
  });
  clampAuthority(contract, input.parentAuthority);
  const lease = deriveLease(assignment, capabilities, input.parentAuthority.allowedTools);
  const id = workerId(input, index);
  rejectIdentityCollision(id, input.currentCohort);
  return { id, role: assignment.role || kind, workerKind: kind,
    topology: assignment.morphologyTopology || input.topology,
    variant: assignment.morphologyVariant || input.variant || null, capabilities, methodContract, workerAssignment,
    workerContract: contract, toolLease: lease, tokenBudget,
    cohortEpoch: input.epoch, status: 'planned' };
}

function deriveLease(assignment, capabilities, allowedTools) {
  const role = assignment.role || assignment.workerKind || 'worker';
  const policyLease = workerToolLeaseForCapabilities(role, capabilities);
  const ceiling = new Set(allowedTools.map(String));
  const requested = Array.isArray(assignment.tools) && assignment.tools.length
    ? new Set(assignment.tools.map(String)) : null;
  return policyLease.filter((tool) => ceiling.has(tool) && (!requested || requested.has(tool)));
}

function clampAuthority(contract, ceiling) {
  for (const key of Object.keys(contract.authority)) {
    if (typeof contract.authority[key] === 'boolean') {
      contract.authority[key] = contract.authority[key] && ceiling[key] === true;
    }
  }
  contract.authority.spawn = false;
  contract.authority.delegate = false;
  contract.authority.topology = false;
}

function requestedBudget(assignment) {
  const amount = assignment.tokenBudget;
  if (!Number.isSafeInteger(amount) || amount < 0) throw failure('MORPHOGENESIS_WORKER_BUDGET_INVALID');
  return amount;
}

function validateBudget(workers, available) {
  const allocated = workers.reduce((sum, worker) => sum + worker.tokenBudget, 0);
  if (allocated > available) throw failure('MORPHOGENESIS_COHORT_BUDGET_EXCEEDED');
}

function workerId(input, index) {
  const digest = crypto.createHash('sha256').update(`${input.missionId}:${input.epoch}:${index}`).digest('hex').slice(0, 12);
  return `${input.missionId}-m${input.epoch}-${digest}`;
}

function cohortId(input) {
  return `${input.missionId}-cohort-${input.epoch}`;
}

function rejectIdentityCollision(id, current) {
  if (current.some((worker) => worker.id === id)) throw failure('MORPHOGENESIS_WORKER_ID_COLLISION');
}

function stringSet(values) {
  return Array.isArray(values) ? [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))] : [];
}

function failure(code) {
  return Object.assign(new Error(code), { code });
}

module.exports = { composeReplacementCohort, MAX_COHORT_WORKERS };
