'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const representativeSampling = require('../src/services/biocenose/formation/representativeSamplingService');
const service = require('../src/services/biocenoseService');
const communityStore = require('../src/services/biocenose/communityStore');
const variants = require('../src/services/biocenose/runtime/variantOrchestrator');

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const competition = measureCompetition();
    const recurrence = await measureRecurrence(db);
    const prediction = await measurePrediction(db);
    process.stdout.write(`Synthetic functional indicators: ${JSON.stringify({
      competition, recurrence, prediction
    })}\n`);
  } finally {
    await db.close();
  }
}

function measureCompetition() {
  const population = Array.from({ length: 12 }, (_, index) => ({
    memberId: `candidate-${index + 1}`, expertise: index < 6 ? 'systems' : 'security',
    provider: `provider-${index % 4}`, lineage: `lineage-${index % 3}`
  }));
  const input = { population, totalQuota: 6, seed: 'functional-indicators-v1' };
  const first = representativeSampling.quotaSample(input);
  const replay = representativeSampling.quotaSample(input);
  assert.deepEqual(replay.sample, first.sample, 'same seed and pool reproduce selection');
  assert.equal(first.sampleSize, 6);
  const selected = new Set(first.sample.map((item) => item.memberId));
  assert.equal(selected.size, 6);
  return { candidateCount: population.length, selectedCount: selected.size,
    selectionRate: selected.size / population.length, reproducible: true };
}

async function measureRecurrence(db) {
  const candidates = roleCandidates();
  const options = { variant: 'persistent_community', population: { generators: 2, reviewers: 2, verifiers: 2 },
    memberCandidates: candidates };
  const first = await service.prepareCommunity({ db, orchestratorId: 'indicator',
    mission: 'Persistent synthetic deliberation', options });
  const second = await service.prepareCommunity({ db, orchestratorId: 'indicator',
    mission: 'Persistent synthetic deliberation', options });
  const firstIds = memberIds(first);
  const secondIds = memberIds(second);
  const overlap = firstIds.filter((id) => secondIds.includes(id)).length;
  const jaccard = overlap / new Set([...firstIds, ...secondIds]).size;
  assert.equal(jaccard, 1, 'identical seed population retains the same cohort');
  assert.ok(second.members.some((member) => member.missionsServed === 1),
    'persisted recruitment history advances tenure on recurrence');
  const events = await communityStore.listEvents(db, second.communityId);
  assert.ok(events.some((event) => event.type === 'MEMBER_RECRUITED'));
  return { priorCohortOverlap: overlap, jaccard, persistedTenureObserved: true };
}

async function measurePrediction(db) {
  const community = await service.prepareCommunity({ db, orchestratorId: 'indicator',
    mission: 'Forecast a synthetic binary event.', options: { variant: 'forecasting_crowd' } });
  const session = await communityStore.loadSession(db, community.communityId);
  const memberId = session.members.find((member) => member.role === 'independent_solver').memberId;
  const forecasts = [{ memberId, eventId: 'synthetic-event', domain: 'synthetic', probability: 0.8 }];
  const receipt = { status: 'VERIFIED', receiptId: 'synthetic-oracle-receipt',
    communityId: community.communityId, eventId: 'synthetic-event', domain: 'synthetic', outcome: 1 };
  const recorded = await variants.persistResolvedOutcomes({ db, communityId: community.communityId,
    actorId: 'indicator', forecasts, outcomes: [{ eventId: 'synthetic-event', domain: 'synthetic',
      outcome: 1, oracleRef: receipt.receiptId, receipt }], isTrustedReceipt: (item) => item.status === 'VERIFIED' });
  const score = variants.scoreResolvedForecasts(forecasts, recorded);
  assert.equal(recorded[0].calibratedCount, 1);
  assert.equal(score.resolvedCount, 1);
  assert.ok(Math.abs(score.meanBrier - 0.04) < 1e-12);
  return { resolvedForecasts: score.resolvedCount, meanBrier: score.meanBrier,
    outcomeSource: 'synthetic trusted fixture' };
}

function roleCandidates() {
  return ['generator', 'generator', 'reviewer', 'reviewer', 'verifier', 'verifier']
    .map((role, index) => ({ memberId: `recurring-${index + 1}`, communityRole: role,
      provider: `provider-${index + 1}`, lineage: `lineage-${index + 1}`, expertise: ['synthetic'] }));
}

function memberIds(community) {
  return community.members.filter((member) => member.role !== 'community_facilitator')
    .map((member) => member.memberId).sort();
}

run().then(() => console.log('Biocenose functional indicators: PASS'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
