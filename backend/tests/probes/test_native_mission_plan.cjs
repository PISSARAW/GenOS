'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { fixtures } = require('../helpers/nativeWorkerFixtures');
const { KINDS } = require('../../src/services/agents/workerKindService');
const { applyNativeMissionPlan } = require('../../src/services/nativeMissionPlanService');
const { assertWorkerDispatchMatches } = require('../../src/services/agentRuntimeAdapter/missionWorkers');

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
  const plan = applyNativeMissionPlan(blankPlan(), { native_objectives: [objective(method, kind)] });
  const assignment = plan.dispatchWorkers[0];
  assert.equal(assignment.workerKind, kind);
  assert.deepEqual(assignment.methodContract, method);
  assert.equal(plan.nativeMissionPlan.selected, 1);
  assert.equal(plan.tokenPolicy.rounds.initial.workerCount, 1);
  const worker = { agentId: `worker-${kind}`, label: assignment.label,
    role: assignment.role, workerKind: kind, methodContract: method,
    executionBudget: { tokens: plan.tokenPolicy.rounds.initial.workerTokens[0] } };
  assert.doesNotThrow(() => assertWorkerDispatchMatches([assignment], [worker], plan));
  assert.throws(() => assertWorkerDispatchMatches([assignment],
    [{ ...worker, methodContract: { ...method, methodId: 'wrong' } }], plan),
  { code: 'NATIVE_OBJECTIVE_DISPATCH_MISMATCH' });
}
assert.throws(() => applyNativeMissionPlan(blankPlan(), {
  native_objectives: [objective({ version: 1, methodId: 'unknown', parameters: {} }, 'unknown')]
}), { code: 'NATIVE_OBJECTIVE_UNRESOLVED' });
assert.throws(() => applyNativeMissionPlan(blankPlan(10), {
  native_objectives: [objective(methods.scout_cell, 'scout_cell')]
}), { code: 'NATIVE_OBJECTIVE_BUDGET_INSUFFICIENT' });
process.stdout.write(JSON.stringify({ schema: 'genos.native-mission-plan-probe/v1',
  selectedKinds: entries.length, divergentDispatchRefused: true,
  unknownMethodRefused: true, insufficientBudgetRefused: true }) + '\n');