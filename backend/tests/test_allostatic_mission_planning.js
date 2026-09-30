'use strict';

const assert = require('node:assert/strict');
const telemetry = require('../src/services/telemetryObserver');
const { applyValencePosture } = require('../src/services/agentRuntimeAdapter/missionPlanning');
const { rankDrives } = require('../src/services/valenceService');

telemetry.emitEvent = () => null;

function planContext(agentId, variables) {
  return {
    agentId,
    normalizedMission: { executionPolicy: { requestedWorkers: 5 }, allowFileEdits: true },
    autonomyPlan: { valenceDrives: { status: 'measured', variables, drives: rankDrives(variables) } }
  };
}

const pressuredVariables = {
  energy: 0.1, memory_pressure: 0.2, social_state: 0.5,
  model_drift: 0.1, context_pressure: 0.8, integrity: 0.9, stress: 0.2
};
const full = planContext('allostatic-full', pressuredVariables);
const ablated = planContext('allostatic-ablated', pressuredVariables);
applyValencePosture(full);

assert.equal(full.normalizedMission.executionPolicy.workerFanoutLimit, 2);
assert.deepEqual(full.autonomyPlan.allostaticPlan.selectedActions, ['reduce_worker_fanout']);
assert.equal(full.autonomyPlan.allostaticPlan.status, 'measured');
assert.equal(full.autonomyPlan.allostaticPlan.outcomePrediction, 'unavailable');
assert.equal(ablated.normalizedMission.executionPolicy.workerFanoutLimit, undefined);

const unsafeVariables = { ...pressuredVariables, energy: 0.8, context_pressure: 0.1, integrity: 0.2 };
const unsafe = planContext('allostatic-integrity', unsafeVariables);
applyValencePosture(unsafe);
assert.equal(unsafe.normalizedMission.executionPolicy.allowFileEdits, false);
assert.equal(unsafe.normalizedMission.requiresEvidenceBeforePromotion, true);
assert.ok(unsafe.autonomyPlan.allostaticPlan.violations.includes('integrity'));

console.log('✅ allostatic production planning ablation passed');
