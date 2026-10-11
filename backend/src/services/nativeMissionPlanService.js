'use strict';

const crypto = require('node:crypto');
const registry = require('./agents/workerExecutorRegistry');
const kinds = require('./agents/workerKindService');
const { buildAllocation } = require('./tokenAllocationService');

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

function assignmentFor(objective, index) {
  const method = objective?.methodContract;
  if (typeof objective?.goal !== 'string' || !objective.goal.trim()
    || method?.version !== 1 || typeof method.methodId !== 'string'
    || !Array.isArray(objective.successCriteria) || !objective.successCriteria.length) {
    throw invalid('NATIVE_OBJECTIVE_INVALID', 'Goal, success criteria and versioned native method are required.');
  }
  const workerKind = selectKind(method.methodId);
  registry.assertNativeInput(workerKind, method);
  const capabilities = kinds.requiredMethodCapabilities(method);
  return { label: `native-objective-${index + 1}`, hypothesis: objective.goal,
    role: workerKind, workerKind, methodContract: method, capabilities,
    rationale: `Unique native executor for ${method.methodId}.`,
    successCriteria: objective.successCriteria, modelTier: 'standard',
    hostContractId: objective.hostContractId || null,
    hostCapabilities: objective.hostCapabilities || [],
    recoveryLease: objective.recoveryLease || null,
    pipelineStage: 0, dependsOn: [] };
}

function allocationFor(plan, count) {
  const policy = plan.tokenPolicy;
  const rounds = buildAllocation({ totalTokens: policy.total, workerShare: policy.workerShare,
    workerCount: count, minimumWorkerTokens: policy.minimumWorkerTokens,
    mode: 'fixed_native_objectives' });
  if (rounds.initial.workerCount !== count) {
    throw invalid('NATIVE_OBJECTIVE_BUDGET_INSUFFICIENT', 'Worker token budget cannot fund every native objective.');
  }
  return rounds;
}

function applyNativeMissionPlan(plan, mission) {
  const objectives = mission.native_objectives || mission.nativeObjectives;
  if (objectives === undefined) return plan;
  if (!Array.isArray(objectives) || !objectives.length || objectives.length > 19) {
    throw invalid('NATIVE_OBJECTIVE_INVALID', 'Provide between 1 and 19 native objectives.');
  }
  if (plan.trinity?.activated || plan.aTeam?.activated) {
    throw invalid('NATIVE_OBJECTIVE_TOPOLOGY_CONFLICT', 'Native objectives cannot override an active team topology.');
  }
  const selected = objectives.map(assignmentFor);
  const rounds = allocationFor(plan, selected.length);
  plan.workers = selected;
  plan.dispatchWorkers = selected;
  plan.tokenPolicy.rounds = rounds;
  const digest = crypto.createHash('sha256').update(JSON.stringify(selected)).digest('hex');
  plan.nativeMissionPlan = { schema: 'genos.native-mission-plan/v1',
    requested: objectives.length, selected: selected.length,
    digest: `sha256:${digest}`, assignments: selected };
  if (mission.agentId) require('./agentOrchestrationState').emit(mission.agentId,
    'NATIVE_MISSION_PLAN_SELECTED', 'PLAN_NATIVE_WORKERS',
    'Selected native worker kinds and methods from mission objectives.',
    plan.nativeMissionPlan, 'info');
  return plan;
}

module.exports = { applyNativeMissionPlan, selectKind };