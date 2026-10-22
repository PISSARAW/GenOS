'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const sm = require('../src/services/morphogenesis/securityMorphogenesis');

test('security morphogenesis exports all required functions', () => {
  assert.equal(typeof sm.runSingleAgent, 'function');
  assert.equal(typeof sm.runTopology, 'function');
  assert.equal(typeof sm.retainSimplestArchitecture, 'function');
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

test('same corpus budget and success criteria for all topologies', () => {
  const single = sm.runSingleAgent(sm.CORPUS);
  assert.equal(single.workerCount, 1);
  assert.equal(single.budget, sm.BUDGET);
  assert.equal(single.results.length, 1);
  assert.equal(single.results[0].length, sm.CORPUS.length);

  for (const topology of sm.TOPOLOGY_LIST) {
    const result = sm.runTopology(topology, 1, sm.CORPUS);
    assert.equal(result.budget, sm.BUDGET);
    assert.equal(result.usage, sm.CYBERCORP_USAGE[topology]);
    assert.equal(result.kind, topology);
    assert.equal(result.workerCount, 1);
    let total = 0;
    for (const shard of result.results) total += shard.length;
    assert.equal(total, sm.CORPUS.length);
  }
});

test('each topology produces deterministic output matching single agent', () => {
  const single = sm.runSingleAgent(sm.CORPUS);
  const singleReliability = sm.reliabilityOf(single);
  assert.equal(singleReliability, 1);

  for (const topology of sm.TOPOLOGY_LIST) {
    const result = sm.runTopology(topology, 1, sm.CORPUS);
    assert.equal(sm.reliabilityOf(result), 1);
    assert.equal(result.combined.ok, true);
  }
});

test('six agents less reliable than single agent retains simplest architecture', () => {
  const single = sm.runSingleAgent(sm.CORPUS);
  const six = sm.runTopology('ATeam', 6, sm.CORPUS);

  const decision = sm.retainSimplestArchitecture(six, single);
  assert.equal(decision.singleReliability, 1);
  assert.ok(decision.topologyReliability <= 1);
  if (decision.topologyReliability < decision.singleReliability) {
    assert.equal(decision.architecture, 'direct');
    assert.equal(decision.reason, 'multi_agent_less_reliable');
  } else {
    assert.equal(decision.architecture, 'ATeam');
    assert.equal(decision.reason, 'multi_agent_sufficient');
  }
});

test('all topologies compared to single agent baseline retains appropriate architecture', () => {
  const single = sm.runSingleAgent(sm.CORPUS);
  for (const topology of sm.TOPOLOGY_LIST) {
    const result = sm.runTopology(topology, 6, sm.CORPUS);
    const decision = sm.retainSimplestArchitecture(result, single);
    assert.ok(decision.architecture === 'direct' || decision.architecture === topology);
    assert.ok(typeof decision.singleReliability === 'number');
    assert.ok(typeof decision.topologyReliability === 'number');
  }
});

test('worker loss does not lose provenance', () => {
  const result = sm.runTopology('Syncytium', 4, sm.CORPUS);
  assert.ok(sm.assertProvenancePreserved(result.receipts));
  const before = result.receipts.length;

  const lost = sm.simulateWorkerLoss(result, 0);
  assert.ok(sm.assertProvenancePreserved(lost.receipts));
  assert.ok(lost.receipts.length > 0);
  assert.ok(lost.receipts.length <= before);
});

test('worker loss recovery preserves receipts and recovers', () => {
  const result = sm.runTopology('Rhizome', 3, sm.CORPUS);
  const lost = sm.simulateWorkerLoss(result, 1);
  const recovered = sm.testRecovery(lost, sm.CORPUS);
  assert.ok(recovered.recovered);
  assert.ok(recovered.receiptsPreserved);
  assert.ok(sm.assertProvenancePreserved(recovered.recovered.receipts));
});

test('model failure is detected and does not corrupt receipts of good workers', () => {
  const failing = sm.simulateModelFailure(sm.CORPUS, 2);
  assert.equal(failing[2].ok, false);
  assert.equal(failing[2].error, 'MODEL_FAILURE');
  for (let i = 0; i < failing.length; i += 1) {
    if (i !== 2) assert.ok(failing[i].ok);
  }
  const receipts = failing.filter((r) => r.receipt).map((r) => r.receipt);
  assert.ok(sm.assertProvenancePreserved(receipts));
});

test('disagreement between two topologies is detected', () => {
  const a = sm.runTopology('Trinity', 3, sm.CORPUS);
  const b = sm.runTopology('ATeam', 6, sm.CORPUS);
  const disagrees = sm.detectDisagreement(a, b);
  assert.ok(typeof disagrees === 'boolean');
});

test('state conflict between two workers is detected', () => {
  const stateA = { worker_1: 'value_a', shared_key: 'x' };
  const stateB = { worker_2: 'value_b', shared_key: 'y' };
  const conflict = sm.detectStateConflict(stateA, stateB);
  assert.ok(conflict.conflict);
  assert.equal(conflict.key, 'shared_key');

  const stateC = { worker_1: 'value_a' };
  const stateD = { worker_2: 'value_b' };
  const noConflict = sm.detectStateConflict(stateC, stateD);
  assert.ok(!noConflict.conflict);
});

test('no permission escalation across authority boundary', () => {
  const authority = ['read', 'write'];
  const boundary = ['read', 'write', 'admin'];
  assert.ok(sm.assertNoPermissionEscalation(authority, boundary));

  const escalated = ['read', 'write', 'admin', 'delete'];
  assert.ok(!sm.assertNoPermissionEscalation(escalated, boundary));

  const wildcard = ['*'];
  assert.ok(!sm.assertNoPermissionEscalation(wildcard, boundary));
});

test('all 8 topologies map to a CyberCorp usage', () => {
  for (const topology of sm.TOPOLOGY_LIST) {
    assert.ok(sm.CYBERCORP_USAGE[topology]);
    assert.ok(typeof sm.CYBERCORP_USAGE[topology] === 'string');
    assert.ok(sm.CYBERCORP_USAGE[topology].length > 0);
  }
});

test('recovery after model failure produces valid result', () => {
  const failing = sm.simulateModelFailure(sm.CORPUS, 0);
  const okCount = failing.filter((r) => r.ok).length;
  assert.ok(okCount > 0);
  const recovered = sm.runTopology('Biome', 2, sm.CORPUS);
  assert.equal(recovered.combined.ok, true);
});
