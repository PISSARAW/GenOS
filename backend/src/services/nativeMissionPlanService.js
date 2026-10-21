'use strict';

const crypto = require('node:crypto');
const registry = require('./agents/workerExecutorRegistry');
const kinds = require('./agents/workerKindService');

function invalid(code, message) {
  return Object.assign(new Error(message), { code });
}

function selectKind(methodId) {
  const matches = registry.executorCatalog()
    .filter((entry) => entry.methods.includes(methodId));
  if (matches.length !== 1) {
    throw invalid('NATIVE_OBJECTIVE_UNRESOLVED',
      `Native method '${methodId || 'unspecified'}' does not select exactly one worker kind.`);
  }
  return matches[0].kind;
}

function nativeWorkerId({ parentId, missionId, index, kind }) {
  const digest = crypto.createHash('sha256')
    .update(`${missionId || 'native-plan'}\u0000${parentId}\u0000${index}\u0000${kind}`)
    .digest('hex').slice(0, 32);
  return `worker_${parentId}_${index}_${digest}`;
}

function nativeStageBatchSize(mission) {
  const configured = Number(mission.executionPolicy?.workerFanoutLimit);
  if (Number.isSafeInteger(configured) && configured > 0) {
    return Math.min(configured, require('./workerGarageService').MAX_ACTIVE_WORKERS);
  }
  return require('./workerGarageService').MAX_ACTIVE_WORKERS;
}

function assertValidObjective(objective) {
  const method = objective?.methodContract;
  if (typeof objective?.goal !== 'string' || !objective.goal.trim()
    || method?.version !== 1 || typeof method.methodId !== 'string'
    || !Array.isArray(objective.successCriteria) || !objective.successCriteria.length) {
    throw invalid('NATIVE_OBJECTIVE_INVALID', 'Goal, success criteria and versioned native method are required.');
  }
}

function assertDelegationLimit(objective, workerKind) {
  const limit = objective.delegatedTokenLimit;
  if (limit !== undefined && (workerKind !== 'sub_orchestrator'
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 10000)) {
    throw invalid('NATIVE_DELEGATION_BUDGET_INVALID',
      'Only a sub-orchestrator can receive an integer delegated-token budget from 1 to 10000.');
  }
}

function assignmentFor({ objective, index, parentId, missionId }) {
  assertValidObjective(objective);
  const method = objective.methodContract;
  const workerKind = selectKind(method.methodId);
  registry.assertNativeInput(workerKind, method);
  assertDelegationLimit(objective, workerKind);
  const capabilities = kinds.requiredMethodCapabilities(method);
  return { label: `native-objective-${index + 1}`,
    workerId: nativeWorkerId({ parentId, missionId, index: index + 1, kind: workerKind }), hypothesis: objective.goal,
    role: workerKind, workerKind, methodContract: method, capabilities,
    rationale: `Unique native executor for ${method.methodId}.`,
    successCriteria: objective.successCriteria, modelTier: 'standard',
    hostContractId: objective.hostContractId || null,
    hostCapabilities: objective.hostCapabilities || [],
    recoveryLease: objective.recoveryLease || null,
    ...(objective.delegatedTokenLimit !== undefined ? { delegatedTokenLimit: objective.delegatedTokenLimit } : {}),
    pipelineStage: 0, dependsOn: [] };
}

function creditAccount(spec, missionId, workerId) {
  if (!missionId || typeof spec.tenantId !== 'string' || !spec.tenantId.trim()
    || !Number.isSafeInteger(spec.capacity) || spec.capacity < 1) {
    throw invalid('NATIVE_EXTERNAL_CREDIT_INVALID',
      'External credit objectives require a mission id, tenant id and positive integer capacity.');
  }
  return { tenantId: spec.tenantId.trim(), missionId, agentId: workerId, capacity: spec.capacity };
}

function recoveryAmount(spec, capacity) {
  const amount = spec.recoveryAmount ?? Math.ceil(capacity * 0.5);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > capacity) {
    throw invalid('NATIVE_EXTERNAL_CREDIT_INVALID', 'External recovery amount must fit the account capacity.');
  }
  return amount;
}

function buildRecoveryHelper({ target, objective, index, missionId, parentId, helperIndex, account, amount, batchStage }) {
  const operationId = `refill-${crypto.createHash('sha256')
    .update(`${missionId}:${target.workerId}:external-credit`).digest('hex').slice(0, 40)}`;
  const helperId = nativeWorkerId({ parentId, missionId, index: helperIndex, kind: 'recovery_worker' });
  return { label: `${target.label}-recovery`, workerId: helperId,
    hypothesis: `Replenish the measured external execution credit for ${target.label}.`,
    role: 'recovery_worker', workerKind: 'recovery_worker',
    methodContract: { version: 1, methodId: 'replenish_external_quota', parameters: {
      tenantId: account.tenantId, missionId, agentId: target.workerId, operationId,
      amount, expectedVersion: 0, capacity: account.capacity
    } },
    capabilities: ['recover'], rationale: `Supervisor-planned recovery for ${target.workerKind}.`,
    successCriteria: ['Return a signed provider transfer receipt and a fresh matching balance observation.'],
    modelTier: 'standard', externalCreditLease: { action: 'replenish_external_quota',
      tenantId: account.tenantId, missionId, targetAgentId: target.workerId,
      operationId, maxAmount: amount, expectedVersion: 0, capacity: account.capacity,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() },
    pipelineStage: batchStage, dependsOn: [] };
}

function externalCreditAssignments(input) {
  const { objective, index, missionId, parentId, helperIndex, batchSize } = input;
  const target = assignmentFor(input);
  const batchStage = Math.floor(index / batchSize) * 2;
  const spec = objective.externalCredit;
  if (!spec) {
    target.pipelineStage = Math.floor(index / batchSize);
    return [target];
  }
  const account = creditAccount(spec, missionId, target.workerId);
  const amount = recoveryAmount(spec, account.capacity);
  const helper = buildRecoveryHelper({ ...input, target, account, amount, batchStage });
  const operationId = helper.methodContract.parameters.operationId;
  target.externalCredit = account;
  target.regulatoryExternalRecovery = { recoveryAgentId: helper.workerId, recoveryRunId: null, operationId };
  target.pipelineStage = batchStage + 1;
  target.dependsOn = [helper.label];
  return [helper, target];
}

function allocationFor(plan, assignments) {
  const policy = plan.tokenPolicy;
  policy.allocation = 'fixed_native_objectives';
  require('./aTeamDispatchBudgetService').applyWorkerBudget(policy, assignments);
  const rounds = policy.rounds;
  if (rounds.initial.workerCount !== assignments.length) {
    throw invalid('NATIVE_OBJECTIVE_BUDGET_INSUFFICIENT', 'Worker token budget cannot fund every native objective.');
  }
  return rounds;
}

function assertParentId(mission) {
  if (typeof mission.agentId !== 'string' || !mission.agentId.trim()) {
    throw invalid('NATIVE_OBJECTIVE_PARENT_REQUIRED', 'A persisted orchestrator identity is required.');
  }
}

function planDigest(assignments) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(assignments)).digest('hex')}`;
}

function assertNativePlanDigest(plan) {
  const sealed = plan?.nativeMissionPlan;
  if (!sealed) return;
  const selected = plan.dispatchWorkers;
  if (!Array.isArray(selected) || selected.length !== sealed.selected
    || planDigest(selected) !== sealed.digest || planDigest(sealed.assignments) !== sealed.digest) {
    throw invalid('NATIVE_OBJECTIVE_PLAN_CHANGED', 'Native dispatch assignments differ from the selected plan.');
  }
}

function applyNativeMissionPlan(plan, mission) {
  const objectives = mission.native_objectives || mission.nativeObjectives;
  if (objectives === undefined) return plan;
  if (!Array.isArray(objectives) || !objectives.length || objectives.length > 19) {
    throw invalid('NATIVE_OBJECTIVE_INVALID', 'Provide between 1 and 19 native objectives.');
  }
  assertParentId(mission);
  if (plan.trinity?.activated || plan.aTeam?.activated) {
    throw invalid('NATIVE_OBJECTIVE_TOPOLOGY_CONFLICT', 'Native objectives cannot override an active team topology.');
  }
  const batchSize = nativeStageBatchSize(mission);
  const selected = objectives.flatMap((objective, index) => externalCreditAssignments({ objective, index,
    parentId: mission.agentId, missionId: mission.missionId,
    helperIndex: objectives.length + index + 1, batchSize }));
  const rounds = allocationFor(plan, selected);
  plan.workers = selected;
  plan.dispatchWorkers = selected;
  plan.tokenPolicy.rounds = rounds;
  plan.nativeMissionPlan = { schema: 'genos.native-mission-plan/v1',
    requested: objectives.length, selected: selected.length,
    digest: planDigest(selected), assignments: selected };
  if (mission.agentId) require('./agentOrchestrationState').emit(mission.agentId,
    'NATIVE_MISSION_PLAN_SELECTED', 'PLAN_NATIVE_WORKERS',
    'Selected native worker kinds and methods from mission objectives.',
    plan.nativeMissionPlan, 'info');
  return plan;
}

module.exports = { applyNativeMissionPlan, assertNativePlanDigest, selectKind };
