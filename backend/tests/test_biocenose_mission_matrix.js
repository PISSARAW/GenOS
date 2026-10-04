'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const service = require('../src/services/biocenoseService');
const store = require('../src/services/biocenose/communityStore');

const MISSIONS = [
  ['epistemic_jury', 'FACTUAL'], ['delphi_community', 'PROBABILISTIC'],
  ['adversarial_assembly', 'FACTUAL'], ['forecasting_crowd', 'PROBABILISTIC'],
  ['argumentation_community', 'EXPLORATORY'], ['polycentric_council', 'DESIGN'],
  ['byzantine_resilient_community', 'FACTUAL'], ['minority_preserving_jury', 'FACTUAL'],
  ['representative_community', 'DESIGN'], ['persistent_community', 'PROBABILISTIC'],
  ['human_ai_deliberation', 'NORMATIVE'], ['hybrid_oracle_community', 'MIXED']
];
const TIERS = [6, 8, 10, 12];

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const completed = [];
  try {
    for (const [variant, questionType] of MISSIONS) {
      for (const participants of TIERS) {
        const id = `${variant}-${participants}`;
        process.stdout.write('Running ' + id + String.fromCharCode(10));
        const outcome = await runMission({ db, id, variant, questionType, participants });
        assertMissionOutcome(variant, outcome);
        completed.push(id);
      }
    }
    assert.equal(completed.length, 48);
    process.stdout.write(`Biocenose mission matrix (${completed.length} scenarios): PASS\n`);
  } finally {
    await db.close();
  }
}

async function runMission(input) {
  const population = { generators: input.participants - 4, reviewers: 2, verifiers: 2 };
  const candidateCount = input.variant === 'representative_community' ? input.participants * 2 : input.participants;
  const candidates = makeCandidates(input, candidateCount, population);
  const community = await service.prepareCommunity({ db: input.db, orchestratorId: 'matrix-runner',
    mission: `Mission ${input.id}`, options: { variant: input.variant, questionType: input.questionType,
      population, memberCandidates: candidates } });
  const judgments = [];
  const result = await service.runBiocenoseRound({ db: input.db, communityId: community.communityId,
    memberInvoker: async (request) => invokeFixture(input, request, judgments),
    verificationExecutor: async ({ claim }) => ({ status: 'VERIFIED', receiptId: `oracle-${claim.claimId}`,
      evidenceRef: 'fixture-proof', outcome: 'PASS', oracle: 'trusted' }),
    isTrustedReceipt: (receipt) => receipt.oracle === 'trusted', missionIndex: input.participants,
    aggregationContext: { options: designOptions(input.participants),
      criteria: [{ key: 'quality', direction: 'max' }], outcomes: [] }
  });
  const events = await store.listEvents(input.db, community.communityId);
  return { community, result, judgments, events };
}

function makeCandidates(input, count, population) {
  const roles = Array.from({ length: population.generators }, () => 'generator')
    .concat(Array.from({ length: population.reviewers }, () => 'reviewer'))
    .concat(Array.from({ length: population.verifiers }, () => 'verifier'));
  return Array.from({ length: count }, (_, index) => {
    const memberId = `${input.id}-member-${index + 1}`;
    const history = Array.from({ length: 4 }, (_, sample) => ({ domain: 'general',
      eventId: `historical-${sample}`, brierScore: 0.1 + (index % 3) / 10 }));
    return { memberId, communityRole: roles[index % roles.length], provider: `provider-${index}`,
      lineage: `lineage-${index}`, expertise: input.variant === 'polycentric_council' ? ['domain-' + (index % 2)] : ['general'], verificationKinds: ['formal_proof'],
      calibrationHistory: history, missionsServed: input.variant === 'persistent_community' && index === 0 ? 25 : index % 3 };
  });
}

function invokeFixture(input, request, judgments) {
  if (request.phase === 'SEALED_JUDGMENT') {
    const prior = Number(request.context.priorPosition);
    const position = Number.isFinite(prior) ? prior : 0.2 + (judgments.length % 5) / 10;
    const prediction = 0.25 + (judgments.length % 5) / 10;
    const output = { judgment: { position, confidence: input.variant === 'byzantine_resilient_community' && judgments.length === 0 ? 0.99 : 0.8,
    evidenceRefs: input.variant === 'byzantine_resilient_community' && judgments.length === 0 ? [] : ['fixture-proof'],
    reasonCodes: ['NEW_EVIDENCE'], claims: [fixtureClaim(input)], assumptions: [], unknowns: [], abstentions: [], probabilities: [
      { eventId: 'forecast-event', domain: 'general', probability: prediction }
    ] } };
    judgments.push(output);
    return output;
  }
  if (request.phase === 'REVIEW') return reviewFixture(input, request);
  if (request.phase === 'REVISION') return { changedClaims: [] };
  if (request.phase === 'LOCAL_COUNCIL_JUDGMENT') return { outcome: request.context.council.councilId === 'council_1' ? 'SHIP' : 'HOLD' };
  throw new Error(`Unexpected member phase ${request.phase}`);
}

function fixtureClaim(input) {
  const claim = { statement: `Evidence claim for ${input.id}` };
  if (input.variant === 'hybrid_oracle_community') {
    return { ...claim, type: 'FACTUAL', verification: { kinds: ['formal_proof'] } };
  }
  if (input.variant === 'adversarial_assembly') return { ...claim, type: 'security' };
  return claim;
}

function reviewFixture(input, request) {
  const review = { summary: 'Fixture review', arguments: [{ relation: 'SUPPORT',
    argument: { statement: 'The provided fixture supports this claim.' } }] };
  if (input.variant === 'minority_preserving_jury') review.dissent = {
    materiality: 0.7, severity: 0.7, claimRefs: [request.context.claim.claimId],
    supportingMembers: [request.member.memberId], evidenceRefs: ['fixture-minority-evidence']
  };
  return review;
}

function designOptions(size) {
  return [{ optionId: 'A', criteria: { quality: size } },
    { optionId: 'B', criteria: { quality: size - 1 } }];
}

function assertMissionOutcome(variant, fixture) {
  const { community, result, events } = fixture;
  assert.equal(result.status, 'COMPLETED', `${variant} runtime completes`);
  const aggregation = result.receipts.find((item) => item.step === 'aggregate_by_question_type')?.result;
  assert.ok(aggregation, `${variant} returns a question aggregation`);
  if (variant === 'representative_community') {
    assert.ok(community.formation.representative.sampleSize > 0);
    assert.ok(Object.values(community.formation.representative.weights).every((weight) => weight > 0));
    assert.ok(community.formation.representative.effectiveSampleSize > 0);
    assert.ok(community.formation.representative.biasComparison.totalVariation.naive >= 0);
    assert.ok(community.formation.representative.biasComparison.totalVariation.representativeWeighted >= 0);
  }
  if (variant === 'delphi_community') assert.ok(aggregation.delphi?.relativeSpread >= 0);
  if (variant === 'forecasting_crowd') assert.ok(aggregation.forecastCalibration);
  if (variant === 'argumentation_community') assert.ok(aggregation.argumentation?.labels);
  if (variant === 'polycentric_council') {
    assert.ok(aggregation.polycentric?.clusters.length);
    assert.equal(aggregation.polycentric.status, 'FEDERATED_PLURALISM');
  }
  if (variant === 'byzantine_resilient_community') {
    const quorum = result.receipts[0].result.byzantine;
    assert.ok(quorum?.faultDomains.domainCount > 0);
    assert.equal(quorum.quorum.memberCount,
      community.members.filter((member) => member.role !== 'community_facilitator').length - 1,
      'quorum uses the roster remaining after quarantine');
    assert.equal(quorum.faultDomains.domainCount, quorum.quorum.memberCount,
      'independent fixture members contribute independent fault domains');
    assert.ok(events.some((event) => event.type === 'MEMBER_QUARANTINED'));
  }
  if (variant === 'persistent_community') {
    const report = result.receipts[0].result.persistentCommunity;
    assert.ok(report?.members.length);
    assert.ok(events.some((event) => event.type === 'MEMBER_ROTATED'));
    assert.equal(report.rotation.rotationDue, true);
    assert.ok(report.excludedMemberIds.length > 0);
  }
  if (variant === 'human_ai_deliberation') {
    const judgment = result.receipts.find((item) => item.step === 'record_community_judgment')?.result.judgment;
    assert.equal(judgment?.status, 'HUMAN_REVIEW_REQUIRED');
  }
  if (variant === 'hybrid_oracle_community') {
    const review = result.receipts.find((item) => item.step === 'review_and_verify')?.result;
    assert.ok(review.verificationReceipts.length > 0);
    assert.ok(aggregation.results.some((item) => item.result.outcome === 'EVIDENCE_SUPPORTED'));
  }
}

run().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
