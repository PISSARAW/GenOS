'use strict';

const assert = require('node:assert/strict');
const { compileMissionStrategy } = require('../../src/services/morphogenesis/missionStrategyCompiler');

const base = {
  mission: 'Reproduire un défaut de concurrence et vérifier le correctif',
  selectedTopology: 'trinity',
  profile: { uncertainty: 0.8, causalAmbiguity: 0.9, deterministicNeed: 0.7,
    adversarialRisk: 0.8, monitoringNeed: 0.6 },
  availableCapabilities: ['observe', 'causal_analysis', 'deterministic_procedure',
    'adversarial_review', 'execute'],
  operationalConstraints: { daemonAllowed: true },
  budget: { tokens: 1000 },
  workerAssignments: ['scout_cell', 'forensic_worker', 'procedural_executor',
    'red_worker', 'resident_daemon']
};

function main() {
  const original = structuredClone(base);
  const program = compileMissionStrategy(base);
  assert.deepEqual(base, original, 'compiler must not mutate the mission input');
  assert.equal(program.schemaVersion, 1);
  assert.equal(program.kind, 'mission_strategy_advisory');
  assert.equal(program.status, 'proposed');
  assert.deepEqual(program.phases.map(phase => phase.status), Array(5).fill('proposed'));
  assert.equal(program.phases[1].workerKind, 'forensic_worker');
  assert.deepEqual(program.phases[1].methodContract, { version: 1, methodId: 'trace_declared_causes' });
  assert.equal(program.phases[2].workerKind, 'procedural_executor');
  assert.equal(program.phases[3].workerKind, 'red_worker');
  assert.equal(program.phases[4].workerKind, 'resident_daemon');
  assert.equal(program.phases[4].methodContract.methodId, 'monitor_samples');
  assert.equal(program.workerRoster.executionAuthorized, false);
  assert.ok(program.workerRoster.phases.every(phase => phase.options.every(option => option.nativeExecutor)));
  assert.ok(program.phases.reduce((sum, phase) => sum + phase.bounds.maxTokens, 0) <= 1000);
  assert.equal(program.bounds.executionAuthorized, false);
  assert.equal(program.evidencePolicy.promotionRequiresVerifiedReceipt, true);
  assert.ok(program.phases.every(phase => phase.execution === 'advisory_only'));
  assert.equal(program.topologyPortfolio.status, 'advisory');
  assert.ok(program.topologyPortfolio.generation.candidateCount <= 10);
  assert.equal(program.topologyPortfolio.ranking.executionAuthorized, false);
  assert.ok(program.topologyPortfolio.ranking.candidates.some(item => item.id === 'NO_CHANGE'));
  assert.equal(program.topologyPortfolio.ranking.decision.decision, 'ABSTAIN');

  const fallback = compileMissionStrategy({ ...base,
    availableCapabilities: ['observe', 'causal_analysis', 'deterministic_procedure', 'verify'],
    workerAssignments: ['scout_cell', 'forensic_worker', 'procedural_executor', 'verifier_worker'] });
  assert.equal(fallback.phases[3].status, 'proposed');
  assert.equal(fallback.phases[3].workerKind, 'verifier_worker');
  assert.equal(fallback.phases[4].status, 'blocked');
  assert.equal(fallback.phases[4].workerKind, null);

  const unavailable = compileMissionStrategy({ ...base,
    workerAssignments: ['scout_cell'],
    availableCapabilities: ['observe'] });
  assert.equal(unavailable.status, 'blocked');
  assert.equal(unavailable.phases[1].status, 'blocked');
  assert.equal(unavailable.phases[1].workerKind, null);
  assert.match(unavailable.phases[1].reason, /matching worker assignment is absent/);

  const adaptiveFallback = compileMissionStrategy({ ...base,
    profile: { adversarialRisk: 0.9 },
    availableCapabilities: ['verify'],
    workerAssignments: ['verifier_worker'],
    operationalConstraints: { daemonAllowed: false }
  });
  assert.equal(adaptiveFallback.phases[3].workerKind, 'verifier_worker');
  assert.equal(adaptiveFallback.phases[3].methodContract.methodId, 'verify_procedure');

  const daemonUnknown = compileMissionStrategy({ ...base,
    operationalConstraints: undefined,
    profile: { monitoringNeed: 0.8 },
    workerAssignments: [{ workerKind: 'resident_daemon', id: 'daemon-a' }]
  });
  assert.equal(daemonUnknown.workerRoster.daemonAuthorization, 'not_supplied');
  assert.equal(daemonUnknown.phases[4].status, 'blocked');
  assert.equal(daemonUnknown.phases[4].daemonStatus, 'authorization_missing');

  const invalid = compileMissionStrategy({ ...base, selectedTopology: 'fictional', budget: { tokens: -1 } });
  assert.equal(invalid.status, 'blocked');
  assert.deepEqual(invalid.errors, ['unknown topology', 'finite non-negative token budget required']);
  assert.equal(invalid.bounds.executionAuthorized, false);

  const noTopologyInventory = compileMissionStrategy({ ...base,
    availableTopologyCapabilities: [] });
  assert.ok(noTopologyInventory.topologyPortfolio.generation.vetoedCandidateCount > 0);
  assert.ok(noTopologyInventory.topologyPortfolio.ranking.vetoed.length > 0);
}

main();
