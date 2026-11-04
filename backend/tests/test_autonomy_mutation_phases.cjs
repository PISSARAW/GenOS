'use strict';
const assert = require('node:assert/strict');
const { modeFlags } = require('../src/services/autonomousOrchestrationService/modeFlags');
const { buildAutonomyPlan } = require('../src/services/autonomousOrchestrationService');
const { buildStrategyContract } = require('../src/services/strategyContractService');
const { assertAutonomyPlanExecutable } = require('../src/services/agentRuntimeAdapter/missionPlanning');

function contractFor(primary) {
  return buildStrategyContract({ problem: 'Reproduce an incident in isolated worlds with deterministic tests',
    requestedPrimary: primary, problemProfile: {
      type: primary === 'genetic_strategy_algorithm' ? 'critical_refactor' : 'incident',
      risk: 'low', complexity: 0.4, uncertainty: 0.2 } });
}

for (const primary of ['mutated_incident_universes', 'controlled_lamarckian_learning',
  'evidence_based_breeding', 'plasmid_divergent_optimization', 'cyber_immunity']) {
  assert.equal(modeFlags({ selected_strategy: { primary } }).evolution, false,
    `${primary} must not require a genome hypermutation phase from a generic trait`);
}
for (const primary of ['simulated_annealing', 'hypermutation_reheat', 'genetic_strategy_algorithm']) {
  assert.equal(modeFlags({ selected_strategy: { primary } }).evolution, true,
    `${primary} must retain its mandatory mutation phase`);
}
const incident = buildAutonomyPlan(contractFor('mutated_incident_universes'), { tokens: 8192 });
assert.equal(incident.executionStatus, 'ready');
assert.deepEqual(incident.omittedPhases, []);
assert(!incident.phases.some(p => p.key === 'controlled_mutation'));

const unsupported = contractFor('genetic_strategy_algorithm');
assert.equal(unsupported.selected_strategy.primary, 'genetic_strategy_algorithm');
unsupported.strategy_portfolio = [{ id: 'unsupported', primitives: ['snapshot'] }];
const blocked = buildAutonomyPlan(unsupported, { tokens: 8192 });
assert.equal(blocked.executionStatus, 'blocked');
assert(blocked.omittedPhases.find(p => p.key === 'controlled_mutation')
  .missingTools.includes('genos_resilience_hypermutation'));
assert.throws(() => assertAutonomyPlanExecutable({ autonomyPlan: blocked,
  dispatchedAgent: { execution_mode: 'orchestrator' }, normalizedMission: {} }),
{ code: 'REQUIRED_PHASES_UNAVAILABLE' });

const genetic = buildAutonomyPlan(contractFor('genetic_strategy_algorithm'), { tokens: 8192 });
assert(genetic.phases.some(p => p.key === 'controlled_mutation'));
console.log('Mutation phases: scenario mutation stays executable; genome mutation and missing-capability gates preserved.');
