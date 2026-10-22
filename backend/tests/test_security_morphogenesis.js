'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const sm = require('../src/services/morphogenesis/securityMorphogenesis');

test('security morphogenesis exports all required functions and constants', () => {
  assert.equal(typeof sm.matchTopologyToMission, 'function');
  assert.equal(typeof sm.runSingleAgent, 'function');
  assert.equal(typeof sm.runDeterministicPipeline, 'function');
  assert.equal(typeof sm.runTopology, 'function');
  assert.equal(typeof sm.simulateDegradedTopology, 'function');
  assert.equal(typeof sm.retainSimplestArchitecture, 'function');
  assert.equal(typeof sm.compareTopologyWithBaselines, 'function');
  assert.equal(typeof sm.simulateWorkerLoss, 'function');
  assert.equal(typeof sm.simulateModelFailure, 'function');
  assert.equal(typeof sm.detectDisagreement, 'function');
  assert.equal(typeof sm.detectStateConflict, 'function');
  assert.equal(typeof sm.testRecovery, 'function');
  assert.equal(typeof sm.assertProvenancePreserved, 'function');
  assert.equal(typeof sm.assertNoPermissionEscalation, 'function');
  assert.equal(Array.isArray(sm.TOPOLOGY_LIST), true);
  assert.equal(sm.TOPOLOGY_LIST.length, 8);
});

test('all 8 topologies match CyberCorp mission needs accurately', () => {
  const missionCases = [
    ['repartir_taches_specialistes', 'ATeam'],
    ['comparer_trois_hypotheses_incident', 'Trinity'],
    ['deliberation_desaccord_abstention', 'Biocenose'],
    ['propager_decouvertes_analyses_liees', 'Rhizome'],
    ['etat_investigation_partage', 'Syncytium'],
    ['encadrer_outils_adaptateurs_immunitaire', 'Holobionte'],
    ['allouer_cpu_ram_tokens_temps', 'Biome'],
    ['comparer_investigations_isolees_environnements', 'Metapopulation']
  ];
  for (const [need, expectedTopology] of missionCases) {
    const matched = sm.matchTopologyToMission(need);
    assert.equal(matched.topology, expectedTopology);
    assert.equal(matched.usage, sm.CYBERCORP_USAGE[expectedTopology]);
  }
});

test('same corpus, budget and success criteria across single agent, deterministic pipeline and all 8 topologies', () => {
  const single = sm.runSingleAgent(sm.CORPUS);
  const pipeline = sm.runDeterministicPipeline(sm.CORPUS);
  assert.equal(single.workerCount, 1);
  assert.equal(pipeline.workerCount, 1);
  assert.equal(single.budget, sm.BUDGET);
  assert.equal(pipeline.budget, sm.BUDGET);
  assert.equal(single.successCriteria, sm.SUCCESS_CRITERIA);
  assert.equal(pipeline.successCriteria, sm.SUCCESS_CRITERIA);

  for (const topology of sm.TOPOLOGY_LIST) {
    const comparison = sm.compareTopologyWithBaselines(topology, 1, sm.CORPUS);
    assert.equal(comparison.sameCorpus, true);
    assert.equal(comparison.sameBudget, true);
    assert.equal(comparison.sameSuccessCriteria, true);
    assert.equal(comparison.topology.usage, sm.CYBERCORP_USAGE[topology]);
    assert.equal(sm.reliabilityOf(comparison.topology), 1);
    assert.equal(sm.reliabilityOf(comparison.single), 1);
    assert.equal(sm.reliabilityOf(comparison.pipeline), 1);
  }
  const sixWorkers = sm.runTopology('ATeam', 6, sm.CORPUS);
  assert.equal(sixWorkers.results.length, 6, 'idle workers remain represented in the paired run');
  assert.equal(sm.compareTopologyWithBaselines('ATeam').sameCorpus, true);
  assert.throws(() => sm.runTopology('ATeam', 0, sm.CORPUS), /positive integer/);
});

test('when six agents produce a less reliable response than one, Morphogenesis retains the simplest architecture', () => {
  const single = sm.runSingleAgent(sm.CORPUS);
  const pipeline = sm.runDeterministicPipeline(sm.CORPUS);
  const degradedSix = sm.simulateDegradedTopology('ATeam', 6, {
    corpus: sm.CORPUS,
    failingWorkerIndices: [0, 2]
  });
  assert.ok(sm.reliabilityOf(degradedSix) < sm.reliabilityOf(single));

  const decision = sm.retainSimplestArchitecture(degradedSix, single, pipeline);
  assert.equal(decision.architecture, 'direct');
  assert.equal(decision.reason, 'multi_agent_less_reliable');
  assert.equal(decision.singleReliability, 1);
  assert.equal(decision.pipelineReliability, 1);
  assert.ok(decision.topologyReliability < 1);
});

test('all topologies compared against single agent and deterministic pipeline baselines', () => {
  const single = sm.runSingleAgent(sm.CORPUS);
  const pipeline = sm.runDeterministicPipeline(sm.CORPUS);
  for (const topology of sm.TOPOLOGY_LIST) {
    const healthySix = sm.runTopology(topology, 6, sm.CORPUS);
    const healthyDecision = sm.retainSimplestArchitecture(healthySix, single, pipeline);
    assert.equal(healthyDecision.architecture, topology);
    assert.equal(healthyDecision.reason, 'multi_agent_sufficient');

    const degradedSix = sm.simulateDegradedTopology(topology, 6, { failingWorkerIndices: [0] });
    const degradedDecision = sm.retainSimplestArchitecture(degradedSix, single, pipeline);
    assert.equal(degradedDecision.architecture, 'direct');
    assert.equal(degradedDecision.reason, 'multi_agent_less_reliable');
  }
});

test('worker loss preserves provenance and prevents permission escalation', () => {
  const result = sm.runTopology('Syncytium', 4, sm.CORPUS);
  assert.ok(sm.assertProvenancePreserved(result.receipts));
  const before = result.receipts.length;

  const lost = sm.simulateWorkerLoss(result, 0);
  assert.equal(lost.provenancePreserved, true);
  assert.equal(lost.receiptsPreserved, true);
  assert.equal(lost.noPermissionEscalation, true);
  assert.ok(sm.assertProvenancePreserved(lost.receipts));
  assert.equal(lost.receipts.length, before, 'the archived receipts remain available after worker loss');
  assert.ok(lost.activeReceipts.length > 0 && lost.activeReceipts.length < before);
});

test('worker loss recovery preserves prior and new receipts without permission escalation', () => {
  const result = sm.runTopology('Rhizome', 3, sm.CORPUS);
  const lost = sm.simulateWorkerLoss(result, 1);
  const recovered = sm.testRecovery(lost, sm.CORPUS);
  assert.ok(recovered.recovered);
  assert.equal(recovered.receiptsPreserved, true);
  assert.equal(recovered.provenancePreserved, true);
  assert.equal(recovered.noPermissionEscalation, true);
  assert.ok(sm.assertProvenancePreserved(recovered.recovered.receipts));
});

test('model failure is isolated and does not corrupt receipts or permissions of surviving workers', () => {
  const failing = sm.simulateModelFailure(sm.CORPUS, 2);
  assert.equal(failing[2].ok, false);
  assert.equal(failing[2].error, 'MODEL_FAILURE');
  for (let i = 0; i < failing.length; i += 1) {
    if (i !== 2) assert.ok(failing[i].ok);
  }
  const receipts = failing.filter((r) => r.receipt).map((r) => r.receipt);
  assert.ok(sm.assertProvenancePreserved(receipts));
  for (const r of receipts) {
    assert.ok(sm.assertNoPermissionEscalation(r.permissions, sm.DEFAULT_BOUNDARY));
  }
});

test('disagreement between topologies and within Biocenose is detected accurately', () => {
  const a = sm.runTopology('Trinity', 3, sm.CORPUS);
  const b = sm.simulateDegradedTopology('ATeam', 6, { failingWorkerIndices: [0] });
  assert.equal(sm.detectDisagreement(a, b), true);
  assert.equal(sm.detectDisagreement(a, a), false);
});

test('state conflict between workers detects divergent values and ignores identical values', () => {
  const stateA = { worker_1: 'value_a', shared_key: 'x' };
  const stateB = { worker_2: 'value_b', shared_key: 'y' };
  const conflict = sm.detectStateConflict(stateA, stateB);
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.key, 'shared_key');

  const agreeingA = { shared_key: 'same', worker_1: 'a' };
  const agreeingB = { shared_key: 'same', worker_2: 'b' };
  assert.equal(sm.detectStateConflict(agreeingA, agreeingB).conflict, false);
});

test('no permission escalation across authority boundary', () => {
  const authority = ['read_telemetry', 'inspect_artifact'];
  const boundary = ['read_telemetry', 'inspect_artifact', 'emit_receipt'];
  assert.equal(sm.assertNoPermissionEscalation(authority, boundary), true);
  assert.equal(sm.assertNoPermissionEscalation(['read_telemetry', 'root_exec'], boundary), false);
  assert.equal(sm.assertNoPermissionEscalation(['*'], boundary), false);
});

test('receipt provenance covers input, output and permissions and rejects tampering', () => {
  const receipt = sm.runSingleAgent(sm.CORPUS).receipts[0];
  assert.equal(sm.assertProvenancePreserved([receipt]), true);
  assert.equal(sm.assertProvenancePreserved([{ ...receipt, outputHash: 'tampered' }]), false);
  assert.equal(sm.assertNoPermissionEscalation(['*'], sm.DEFAULT_BOUNDARY), false);
});

test('state conflict comparison is independent of object key ordering', () => {
  assert.equal(sm.detectStateConflict({ shared: { a: 1, b: 2 } }, { shared: { b: 2, a: 1 } }).conflict, false);
});

test('CyberCorp Windows, AD, pfSense and Sysmon scenario fixtures run through DEO with process measurements', () => {
  const domains = sm.CORPUS.map((m) => m.domain);
  assert.deepEqual(domains, ['windows', 'active_directory', 'pfsense', 'sysmon', 'cross_domain']);

  const ateam = sm.runTopology('ATeam', 4, sm.CORPUS);
  const trinity = sm.runTopology('Trinity', 3, sm.CORPUS);
  assert.equal(ateam.combined.ok, true);
  assert.equal(trinity.combined.ok, true);
  assert.equal(ateam.measuredBudget.withinBudget, true);
  assert.ok(Number.isFinite(ateam.measuredBudget.cpuMs));
  assert.ok(ateam.measuredBudget.cpuMs >= 0);
  assert.equal(ateam.measuredBudget.tokens, 0);

  const flatEntries = ateam.results.flat();
  assert.equal(flatEntries.length, 5);
  for (const entry of flatEntries) {
    assert.equal(entry.ok, true);
    assert.equal(entry.cyberCorpEvidence.deoIntact, true);
    assert.equal(entry.cyberCorpEvidence.matchingHost, true);
    assert.equal(entry.cyberCorpEvidence.extractionFidelityRate, 1);
    assert.ok(entry.cyberCorpEvidence.lptReceiptId.startsWith('solver://sha256:'));
  }
});
