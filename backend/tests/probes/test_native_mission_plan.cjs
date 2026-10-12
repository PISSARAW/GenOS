'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { fixtures } = require('../helpers/nativeWorkerFixtures');
const { KINDS } = require('../../src/services/agents/workerKindService');
const { applyNativeMissionPlan, assertNativePlanDigest } = require('../../src/services/nativeMissionPlanService');
const { assertWorkerDispatchMatches } = require('../../src/services/agentRuntimeAdapter/missionWorkers');
const { assignedWorkerId, validateAssignments } = require('../../src/services/agentFleetWorkers');

const root = path.resolve(__dirname, '../../../..');
const methods = fixtures(root);

function blankPlan(tokens = 100000) {
  return { tokenPolicy: { total: tokens, workerShare: 0.8,
    minimumWorkerTokens: 100, rounds: {} },
  trinity: { activated: false }, aTeam: { activated: false } };
}

function objective(method, kind) {
  return { goal: `Prove native ${kind} result`, successCriteria: ['Signed native evidence'],
    methodContract: method,
    ...(kind === 'symbiotic_worker' ? { hostContractId: 'host-native',
      hostCapabilities: ['deterministic_procedure'] } : {}) };
}

const entries = Object.entries(methods);
assert.equal(entries.length, Object.keys(KINDS).length);
for (const [kind, method] of entries) {
  const plan = applyNativeMissionPlan(blankPlan(), { agentId: 'native-parent',
    native_objectives: [objective(method, kind)] });
  const assignment = plan.dispatchWorkers[0];
  assert.equal(assignment.workerKind, kind);
  assert.match(assignment.workerId, /^worker_native-parent_1_[a-f0-9]{32}$/);
  assert.equal(assignedWorkerId(assignment, { orchestratorId: 'native-parent', index: 0,
    nativeMissionPlan: true }), assignment.workerId);
  assert.deepEqual(assignment.methodContract, method);
  assert.equal(plan.nativeMissionPlan.selected, 1);
  assert.doesNotThrow(() => assertNativePlanDigest(plan));
  assert.equal(plan.tokenPolicy.rounds.initial.workerCount, 1);
  const worker = { agentId: assignment.workerId, label: assignment.label,
    role: assignment.role, workerKind: kind, methodContract: method,
    executionBudget: { tokens: plan.tokenPolicy.rounds.initial.workerTokens[0] } };
  assert.doesNotThrow(() => assertWorkerDispatchMatches([assignment], [worker], plan));
  assert.throws(() => assertWorkerDispatchMatches([assignment],
    [{ ...worker, methodContract: { ...method, methodId: 'wrong' } }], plan),
  { code: 'NATIVE_OBJECTIVE_DISPATCH_MISMATCH' });
  assert.throws(() => assertWorkerDispatchMatches([assignment],
    [{ ...worker, agentId: 'substituted-worker' }], plan),
  { code: 'NATIVE_OBJECTIVE_DISPATCH_MISMATCH' });
}
assert.throws(() => applyNativeMissionPlan(blankPlan(), {
  agentId: 'native-parent',
  native_objectives: [objective({ version: 1, methodId: 'unknown', parameters: {} }, 'unknown')]
}), { code: 'NATIVE_OBJECTIVE_UNRESOLVED' });
assert.throws(() => applyNativeMissionPlan(blankPlan(10), {
  agentId: 'native-parent',
  native_objectives: [objective(methods.scout_cell, 'scout_cell')]
}), { code: 'NATIVE_OBJECTIVE_BUDGET_INSUFFICIENT' });
assert.throws(() => applyNativeMissionPlan(blankPlan(), {
  native_objectives: [objective(methods.scout_cell, 'scout_cell')]
}), { code: 'NATIVE_OBJECTIVE_PARENT_REQUIRED' });
const two = applyNativeMissionPlan(blankPlan(), { agentId: 'native-parent', native_objectives: [
  objective(methods.scout_cell, 'scout_cell'), objective(methods.bounded_worker, 'bounded_worker')
] });
assert.notEqual(two.dispatchWorkers[0].workerId, two.dispatchWorkers[1].workerId);
assert.match(two.dispatchWorkers[1].workerId, /^worker_native-parent_2_[a-f0-9]{32}$/);
const firstId = two.dispatchWorkers[0].workerId;
two.nativeMissionPlan.assignments = structuredClone(two.nativeMissionPlan.assignments);
two.nativeMissionPlan.assignments[0].workerId = 'published-substitution';
assert.throws(() => assertNativePlanDigest(two), { code: 'NATIVE_OBJECTIVE_PLAN_CHANGED' });
two.nativeMissionPlan.assignments[0].workerId = firstId;
two.dispatchWorkers[1].workerId = 'substituted-worker';
assert.throws(() => assertNativePlanDigest(two), { code: 'NATIVE_OBJECTIVE_PLAN_CHANGED' });
const externallyRegulatedObjective = { ...objective(methods.scout_cell, 'scout_cell'),
  externalCredit: { tenantId: 'native-tenant', capacity: 10, recoveryAmount: 5 } };
const externalPlan = applyNativeMissionPlan(blankPlan(), { agentId: 'native-parent',
  missionId: 'native-mission', native_objectives: [externallyRegulatedObjective] });
assert.equal(externalPlan.nativeMissionPlan.requested, 1);
assert.equal(externalPlan.nativeMissionPlan.selected, 2);
const [recoveryAssignment, regulatedAssignment] = externalPlan.dispatchWorkers;
assert.equal(recoveryAssignment.workerKind, 'recovery_worker');
assert.equal(recoveryAssignment.methodContract.methodId, 'replenish_external_quota');
assert.equal(recoveryAssignment.pipelineStage, 0);
assert.deepEqual(recoveryAssignment.dependsOn, []);
assert.equal(regulatedAssignment.workerKind, 'scout_cell');
assert.equal(regulatedAssignment.externalCredit.agentId, regulatedAssignment.workerId);
assert.equal(regulatedAssignment.externalCredit.missionId, 'native-mission');
assert.equal(regulatedAssignment.regulatoryExternalRecovery.recoveryAgentId, recoveryAssignment.workerId);
assert.equal(regulatedAssignment.pipelineStage, 1);
assert.deepEqual(regulatedAssignment.dependsOn, [recoveryAssignment.label]);
assert.doesNotThrow(() => assertNativePlanDigest(externalPlan));
const repeatedExternalPlan = applyNativeMissionPlan(blankPlan(), { agentId: 'native-parent',
  missionId: 'native-mission', native_objectives: [externallyRegulatedObjective] });
assert.deepEqual(repeatedExternalPlan.dispatchWorkers.map(worker => worker.workerId),
  externalPlan.dispatchWorkers.map(worker => worker.workerId), 'native worker identities must be reproducible for the same mission');
const regulatedMatrixPlan = applyNativeMissionPlan(blankPlan(1000000), { agentId: 'native-parent',
  missionId: 'native-mission', executionPolicy: { workerFanoutLimit: 3 },
  native_objectives: entries.map(([kind, method]) => ({ ...objective(method, kind),
    ...(kind === 'sub_orchestrator' ? { delegatedTokenLimit: 1000 } : {}),
    externalCredit: { tenantId: 'native-tenant', capacity: 10, recoveryAmount: 5 } })) });
assert.equal(regulatedMatrixPlan.nativeMissionPlan.requested, entries.length);
assert.equal(regulatedMatrixPlan.nativeMissionPlan.selected, entries.length * 2);
const matrixStageCounts = new Map();
for (const assignment of regulatedMatrixPlan.dispatchWorkers) {
  matrixStageCounts.set(assignment.pipelineStage, (matrixStageCounts.get(assignment.pipelineStage) || 0) + 1);
}
assert.ok(Math.max(...matrixStageCounts.values()) <= 3,
  'native external recovery plan must batch work within the requested worker fan-out');
assert.doesNotThrow(() => validateAssignments(regulatedMatrixPlan.dispatchWorkers, regulatedMatrixPlan),
  'native orchestration should validate peak staged fan-out instead of total plan size');
const maxConcurrentWorkers = require('../../src/services/workerGarageService').maxActiveWorkers();
assert.throws(() => validateAssignments(Array.from({ length: maxConcurrentWorkers + 1 }, (_, index) => ({
  ...regulatedMatrixPlan.dispatchWorkers[index % regulatedMatrixPlan.dispatchWorkers.length],
  pipelineStage: 0
})),
  { nativeMissionPlan: { ...regulatedMatrixPlan.nativeMissionPlan }, dispatchWorkers:
    Array.from({ length: maxConcurrentWorkers + 1 }, (_, index) => ({
      ...regulatedMatrixPlan.dispatchWorkers[index % regulatedMatrixPlan.dispatchWorkers.length], pipelineStage: 0
    })) }),
{ code: 'WORKER_FANOUT_LIMIT' });
for (let index = 0; index < entries.length; index += 1) {
  const recovery = regulatedMatrixPlan.dispatchWorkers.find(worker => worker.label === `native-objective-${index + 1}-recovery`);
  const target = regulatedMatrixPlan.dispatchWorkers.find(worker => worker.label === `native-objective-${index + 1}`);
  assert.equal(target.pipelineStage, recovery.pipelineStage + 1);
  assert.deepEqual(target.dependsOn, [recovery.label]);
}
const subOrchestrator = regulatedMatrixPlan.dispatchWorkers.find(worker => worker.workerKind === 'sub_orchestrator');
assert.equal(subOrchestrator.delegatedTokenLimit, 1000,
  'native plan must preserve the explicit bounded delegation budget');
assert.throws(() => applyNativeMissionPlan(blankPlan(), { agentId: 'native-parent',
  native_objectives: [{ ...objective(methods.scout_cell, 'scout_cell'), delegatedTokenLimit: 1000 }] }),
{ code: 'NATIVE_DELEGATION_BUDGET_INVALID' });
assert.throws(() => applyNativeMissionPlan(blankPlan(), { agentId: 'native-parent',
  native_objectives: [externallyRegulatedObjective] }), { code: 'NATIVE_EXTERNAL_CREDIT_INVALID' });
process.stdout.write(JSON.stringify({ schema: 'genos.native-mission-plan-probe/v1',
  selectedKinds: entries.length, divergentDispatchRefused: true, substitutedWorkerRefused: true,
  unknownMethodRefused: true, insufficientBudgetRefused: true,
  externalRecoveryHelperPlanned: true, externalRecoveryDependencySealed: true,
  nineteenKindExternalRecoveryPlanBatched: true }) + '\n');
