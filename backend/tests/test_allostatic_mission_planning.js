'use strict';

const assert = require('node:assert/strict');
const telemetry = require('../src/services/telemetryObserver');
const { applyValencePosture } = require('../src/services/agentRuntimeAdapter/missionPlanning');
const { capAssignments } = require('../src/services/agentRuntimeAdapter/missionWorkers');
const { rankDrives } = require('../src/services/valenceService');

telemetry.emitEvent = () => null;

function planContext(agentId, variables) {
  return {
    agentId,
    normalizedMission: { executionPolicy: { requestedWorkers: 5 }, allowFileEdits: true },
    autonomyPlan: { workers: Array.from({ length: 5 }, (_, index) => ({ workerId: `worker-${index + 1}` })),
      valenceDrives: { status: 'measured', variables, drives: rankDrives(variables) } }
  };
}

const pressuredVariables = {
  energy: 0.1, memory_pressure: 0.2, social_state: 0.5,
  model_drift: 0.1, context_pressure: 0.8, integrity: 0.9, stress: 0.2
};
const full = planContext('allostatic-full', pressuredVariables);
const ablated = planContext('allostatic-ablated', pressuredVariables);
const assignments = Array.from({ length: 5 }, (_, index) => ({ workerId: `worker-${index + 1}` }));
applyValencePosture(full);

assert.equal(full.normalizedMission.executionPolicy.workerFanoutLimit, 2);
assert.deepEqual(full.autonomyPlan.allostaticPlan.selectedActions, ['reduce_worker_fanout']);
assert.equal(full.autonomyPlan.allostaticPlan.status, 'measured');
assert.equal(full.autonomyPlan.allostaticPlan.outcomePrediction, 'unavailable');
assert.equal(ablated.normalizedMission.executionPolicy.workerFanoutLimit, undefined);
const fullDispatch = capAssignments(assignments, full);
const ablatedDispatch = capAssignments(assignments, ablated);
assert.equal(fullDispatch.length, 2, 'measured intervention caps the assignments admitted to dispatch');
assert.equal(ablatedDispatch.length, 5, 'ablated policy admits the full identical assignment set');
assert.deepEqual(fullDispatch, assignments.slice(0, 2), 'dispatch cap preserves deterministic assignment order');

const unsafeVariables = { ...pressuredVariables, energy: 0.8, context_pressure: 0.1, integrity: 0.2 };
const unsafe = planContext('allostatic-integrity', unsafeVariables);
applyValencePosture(unsafe);
assert.equal(unsafe.normalizedMission.executionPolicy.allowFileEdits, false);
assert.equal(unsafe.normalizedMission.requiresEvidenceBeforePromotion, true);
assert.ok(unsafe.autonomyPlan.allostaticPlan.violations.includes('integrity'));

console.log('✅ allostatic planning-to-dispatch causal ablation passed');
