'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { fixtures } = require('../helpers/nativeWorkerFixtures');
const { KINDS } = require('../../src/services/agents/workerKindService');
const { applyNativeMissionPlan, assertNativePlanDigest } = require('../../src/services/nativeMissionPlanService');
const { assertWorkerDispatchMatches } = require('../../src/services/agentRuntimeAdapter/missionWorkers');
const { assignedWorkerId } = require('../../src/services/agentFleetWorkers');

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
  assert.match(assignment.workerId, /^worker_native-parent_1_[a-f0-9-]+$/);
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
assert.match(two.dispatchWorkers[1].workerId, /^worker_native-parent_2_[a-f0-9-]+$/);
const firstId = two.dispatchWorkers[0].workerId;
two.nativeMissionPlan.assignments = structuredClone(two.nativeMissionPlan.assignments);
two.nativeMissionPlan.assignments[0].workerId = 'published-substitution';
assert.throws(() => assertNativePlanDigest(two), { code: 'NATIVE_OBJECTIVE_PLAN_CHANGED' });
two.nativeMissionPlan.assignments[0].workerId = firstId;
two.dispatchWorkers[1].workerId = 'substituted-worker';
assert.throws(() => assertNativePlanDigest(two), { code: 'NATIVE_OBJECTIVE_PLAN_CHANGED' });
process.stdout.write(JSON.stringify({ schema: 'genos.native-mission-plan-probe/v1',
  selectedKinds: entries.length, divergentDispatchRefused: true, substitutedWorkerRefused: true,
  unknownMethodRefused: true, insufficientBudgetRefused: true }) + '\n');
