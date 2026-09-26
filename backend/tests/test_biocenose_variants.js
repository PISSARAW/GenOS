'use strict';

const assert = require('node:assert/strict');
const router = require('../src/services/biocenose/variants/variantPolicyRouter');
const acceptability = require('../src/services/biocenose/argumentation/acceptabilityService');
const polycentric = require('../src/services/biocenose/deliberation/polycentricCouncilService');
const quorum = require('../src/services/biocenose/byzantine/byzantineQuorumService');
const sampling = require('../src/services/biocenose/formation/representativeSamplingService');
const reputation = require('../src/services/biocenose/calibration/persistentReputationService');

const VARIANT_IDS = ['epistemic_jury', 'delphi_community', 'adversarial_assembly', 'forecasting_crowd',
  'argumentation_community', 'polycentric_council', 'byzantine_resilient_community', 'minority_preserving_jury',
  'representative_community', 'persistent_community', 'human_ai_deliberation', 'hybrid_oracle_community'];

const PARTIAL_VARIANTS = new Set(['argumentation_community', 'polycentric_council',
  'byzantine_resilient_community', 'representative_community', 'persistent_community']);

function testVariantSurface() {
  assert.deepEqual(Object.keys(router.POLICIES).sort(), [...VARIANT_IDS].sort());
  for (const id of VARIANT_IDS) {
    const selected = router.select(id);
    assert.equal(selected.name, id);
    const expectedLevel = PARTIAL_VARIANTS.has(id) ? 'PARTIAL' : 'EXECUTABLE';
    assert.equal(selected.executionLevel, expectedLevel, `${id} execution level`);
    assert.ok(selected.disclosure && selected.review && selected.aggregation && selected.dissent);
  }
  assert.equal(router.select('Epistemic-Jury').name, 'epistemic_jury');
}

function testVariantContracts() {
  assert.equal(router.select('delphi_community').minimumRounds, 2);
  assert.equal(router.select('adversarial_assembly').requireAdversarialReviewer, true);
  assert.equal(router.select('forecasting_crowd').probabilisticOnly, true);
  assert.equal(router.select('forecasting_crowd').requireCalibrationWeights, true);
  assert.equal(router.select('minority_preserving_jury').preserveAllDissent, true);
  assert.equal(router.select('human_ai_deliberation').requireHumanReview, true);
  assert.equal(router.select('hybrid_oracle_community').requireDeterministicVerifier, true);
  assert.equal(router.select('byzantine_resilient_community').quarantineAware, true);
  assert.throws(() => router.select('unknown_variant'), (error) => error.code === 'BIOCENOSE_VARIANT_UNKNOWN');
  assert.throws(() => router.assertCompatible(router.select('forecasting_crowd'), 'FACTUAL'),
    (error) => error.code === 'BIOCENOSE_VARIANT_QUESTION_TYPE_INVALID');
}

function testRecommend() {
  const forecast = router.recommend('What is the probability of rain tomorrow?', 'PROBABILISTIC');
  assert.equal(forecast.selection.variant, 'forecasting_crowd');
  const audit = router.recommend('Audit this code for security threats.', 'FACTUAL');
  assert.equal(audit.selection.variant, 'adversarial_assembly');
  const baseline = router.recommend('Summarize this paragraph.', 'FACTUAL');
  assert.equal(baseline.selection.method, 'safe_baseline');
}

function testGroundedLabelling() {
  const input = {
    arguments: [{ argumentId: 'a1' }, { argumentId: 'a2' }, { argumentId: 'a3' }],
    attacks: [{ from: 'a2', to: 'a1' }, { from: 'a3', to: 'a2' }]
  };
  const result = acceptability.groundedLabelling(input);
  assert.equal(result.labels.a3, 'IN');
  assert.equal(result.labels.a2, 'OUT');
  assert.equal(result.labels.a1, 'IN');
  assert.deepEqual(result.undecided, []);
  const cyclic = acceptability.groundedLabelling({
    arguments: [{ argumentId: 'x' }, { argumentId: 'y' }],
    attacks: [{ from: 'x', to: 'y' }, { from: 'y', to: 'x' }]
  });
  assert.deepEqual(cyclic.undecided.sort(), ['x', 'y']);
}

function testCycleDetection() {
  const acyclic = acceptability.detectCycles({
    arguments: [{ argumentId: 'a1' }, { argumentId: 'a2' }],
    attacks: [{ from: 'a1', to: 'a2' }]
  });
  assert.deepEqual(acyclic.cyclicArgumentIds, []);
  assert.equal(acyclic.cycleCount, 0);
  const cyclic = acceptability.detectCycles({
    arguments: [{ argumentId: 'x' }, { argumentId: 'y' }, { argumentId: 'z' }],
    attacks: [{ from: 'x', to: 'y' }, { from: 'y', to: 'x' }, { from: 'z', to: 'z' }]
  });
  assert.ok(cyclic.cyclicArgumentIds.includes('x'));
  assert.ok(cyclic.cyclicArgumentIds.includes('y'));
  assert.ok(cyclic.cycleCount >= 1);
}

function testArgumentAdjudication() {
  const results = acceptability.adjudicate({
    claims: [{ claimId: 'c1' }, { claimId: 'c2' }],
    arguments: [{ argumentId: 'a1' }, { argumentId: 'a2' }, { argumentId: 'a3' }],
    attacks: [{ from: 'a2', to: 'a1' }, { from: 'a3', to: 'a2' }],
    supports: [{ claimId: 'c1', argumentId: 'a1' }, { claimId: 'c2', argumentId: 'a2' }]
  });
  const first = results.find((item) => item.claimId === 'c1');
  assert.equal(first.status, 'ACCEPTED');
  assert.equal(first.burdenOfProof, 'MET');
  const second = results.find((item) => item.claimId === 'c2');
  assert.equal(second.status, 'REJECTED');
  assert.equal(second.burdenOfProof, 'UNMET');
  assert.deepEqual(second.groundedAttackers, ['a3']);
}

function testPolycentricCouncil() {
  const members = [
    { memberId: 'm1', expertise: 'sec', provider: 'a', lineage: 'x' },
    { memberId: 'm2', expertise: 'sec', provider: 'b', lineage: 'y' },
    { memberId: 'm3', expertise: 'ux', provider: 'a', lineage: 'x' },
    { memberId: 'm4', expertise: 'ux', provider: 'b', lineage: 'y' }
  ];
  const councils = polycentric.composeSubCouncils({ members, councilCount: 2 });
  assert.equal(councils.length, 2);
  assert.deepEqual(councils.flatMap((council) => council.memberIds).sort(), ['m1', 'm2', 'm3', 'm4']);
  assert.throws(() => polycentric.composeSubCouncils({ members: [] }),
    (error) => error.code === 'BIOCENOSE_COUNCIL_NO_MEMBERS');
  const federated = polycentric.federate({
    clusters: [
      { clusterId: 'council_1', outcome: 'SHIP', distribution: [{ position: 'ship', share: 1, memberCount: 2 }], dissent: [] },
      { clusterId: 'council_2', outcome: 'HOLD', distribution: [{ position: 'hold', share: 0.6, memberCount: 2 }],
        dissent: [{ dissentId: 'd1' }], minorityEvidenceBypass: [] }
    ]
  });
  assert.equal(federated.status, 'FEDERATED_PLURALISM');
  assert.deepEqual(federated.subsidiarity.localRetained, ['council_1']);
  assert.deepEqual(federated.subsidiarity.escalated, ['council_2']);
  assert.equal(federated.parentMustReview, true);
}

function testByzantineQuorum() {
  const quorum4 = quorum.quorumFor({ memberCount: 4, faultyAssumed: 1 });
  assert.equal(quorum4.maxFaulty, 1);
  assert.equal(quorum4.quorum, 3);
  assert.equal(quorum4.bftPossible, true);
  const quorumSmall = quorum.quorumFor({ memberCount: 3, faultyAssumed: 1 });
  assert.equal(quorumSmall.maxFaulty, 0);
  assert.equal(quorumSmall.honorsAssumption, false);
  const domains = quorum.partitionFaultDomains({
    members: [
      { memberId: 'm1', provider: 'a', lineage: 'x' },
      { memberId: 'm2', provider: 'a', lineage: 'x' },
      { memberId: 'm3', provider: 'b', lineage: 'y' }
    ]
  });
  assert.equal(domains.domainCount, 2);
  assert.equal(domains.largestDomainSize, 2);
  const decayed = quorum.decayTrust({ trust: 0.8, periodsMissed: 4, halfLifePeriods: 4 });
  assert.equal(decayed.decayedTrust, 0.4);
  const admitted = quorum.admitMember({ member: { memberId: 'm9', provider: 'c' }, members: [], trust: 0.9 });
  assert.equal(admitted.verdict, 'ADMIT');
  const sybil = quorum.admitMember({
    member: { memberId: 'm9', provider: 'a', lineage: 'x', errorVector: [1, 0] },
    members: [{ memberId: 'm1', provider: 'a', lineage: 'x', errorVector: [1, 0] }],
    trust: 0.9
  });
  assert.equal(sybil.verdict, 'REJECT');
  const quarantined = quorum.admitMember({
    member: { memberId: 'm9', provider: 'c' }, members: [],
    signalFlags: ['HIGH_CONFIDENCE_WITHOUT_EVIDENCE'], trust: 0.9
  });
  assert.equal(quarantined.verdict, 'QUARANTINE');
}

function testRepresentativeSampling() {
  const population = [
    { memberId: 'm1', expertise: 'sec', provider: 'a', lineage: 'x' },
    { memberId: 'm2', expertise: 'sec', provider: 'a', lineage: 'x' },
    { memberId: 'm3', expertise: 'ux', provider: 'a', lineage: 'x' },
    { memberId: 'm4', expertise: 'ux', provider: 'a', lineage: 'x' }
  ];
  const stratified = sampling.stratify({ population });
  assert.equal(stratified.populationSize, 4);
  assert.equal(stratified.strata.length, 2);
  const sampled = sampling.quotaSample({ population, totalQuota: 2 });
  assert.equal(sampled.sampleSize, 2);
  const reweighted = sampling.reweight({ population, sample: sampled.sample });
  assert.equal(Object.keys(reweighted.weights).length, 2);
  const ess = sampling.effectiveSampleSize({ weights: reweighted.weights });
  assert.ok(ess.effectiveSampleSize > 0);
  assert.ok(ess.efficiency <= 1);
  assert.throws(() => sampling.stratify({ population: [] }), (error) => error.code === 'BIOCENOSE_SAMPLING_EMPTY');
}

function testPersistentReputation() {
  const decayed = reputation.decayReputation({ reputation: 0.9, periodsElapsed: 6, halfLifeMissions: 6 });
  assert.equal(decayed.decayedReputation, 0.7);
  const domains = reputation.domainReputation({ memberId: 'm1', records: [
    { domain: 'security', brierScore: 0.1 },
    { domain: 'security', brierScore: 0.3 },
    { domain: 'ux', brierScore: 0.0 }
  ] });
  const security = domains.domains.find((item) => item.domain === 'security');
  assert.equal(security.meanBrier, 0.2);
  assert.equal(security.reputation, 0.8);
  assert.equal(reputation.membershipDecision({ reputation: 0.8, sampleCount: 10 }).decision, 'RETAIN');
  assert.equal(reputation.membershipDecision({ reputation: 0.1, sampleCount: 10 }).decision, 'EXPEL');
  assert.equal(reputation.membershipDecision({ reputation: 0.9, sampleCount: 1 }).decision, 'PROBATION');
  const rotation = reputation.antiEntrenchment({
    tenures: [{ memberId: 'm1', missions: 6 }, { memberId: 'm2', missions: 2 }],
    maxTenureMissions: 5
  });
  assert.deepEqual(rotation.rotate.map((item) => item.memberId), ['m1']);
  assert.equal(rotation.rotationDue, true);
}

testVariantSurface();
testVariantContracts();
testRecommend();
testGroundedLabelling();
testCycleDetection();
testArgumentAdjudication();
testPolycentricCouncil();
testByzantineQuorum();
testRepresentativeSampling();
testPersistentReputation();
console.log('✅ Biocenose variant tests passed.');
