'use strict';

const assert = require('node:assert/strict');
const experiments = require('../src/services/agow/agowExperimentService');
const protocol = require('../src/services/agow/experiments/agowBenchmarkProtocolService');

const scopes = { agent: {}, topology: {}, mission: {}, organization: {} };
const input = { resourceBudget: 10, independentOracle: { oracleId: 'oracle-v1', acceptanceRef: 'test:acceptance' },
  allostaticLevels: scopes };
protocol.validateScenario('collective_viability_causal', [{ caseId: 'case-1', input }]);
assert.throws(() => protocol.validateScenario('collective_viability_causal', [{ caseId: 'case-1', input: {} }]), /resource budget/);
assert.throws(() => protocol.validateIndependentOutcome({ success: true, independentOracle: { verified: false } }, input), /independent verification/);
const outcome = { success: true, independentOracle: { verified: true }, goalProgress: 0.9,
  resourceReserve: 0.8, missionStability: 0.9, blockageEvents: 0, viabilityViolations: 0, resourceBudget: 10 };
assert.equal(protocol.validateIndependentOutcome(outcome, input), outcome);
assert.throws(() => protocol.validateIndependentOutcome({ ...outcome, resourceBudget: 9 }, input), /matched budget/);
const paired = experiments.pairedComparisons([
  { caseId: 'a', condition: 'salience_only', outcome: { success: false } },
  { caseId: 'a', condition: 'full', outcome: { success: true } },
  { caseId: 'b', condition: 'salience_only', outcome: { success: true } },
  { caseId: 'b', condition: 'full', outcome: { success: true } }
], 'successRate');
assert.equal(paired.full.n, 2);
assert.equal(paired.full.meanDifference, 0.5);
assert.equal(paired.full.lower95, -0.48);
console.log('✅ AGOW collective viability paired benchmark gates passed');
