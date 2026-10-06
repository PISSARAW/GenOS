'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const service = require('../src/services/biocenoseService');
const store = require('../src/services/biocenose/communityStore');
const leases = require('../src/services/biocenose/runtime/runtimeLeaseService');
const fixture = require('./helpers/biocenoseCompletionFixtures');

async function testVerifiedExecutionAndRecovery(db) {
  const community = await fixture.prepare(db);
  const input = fixture.runtimeInput(db, community.communityId);
  let invoked = 0;
  let fail = true;
  input.memberInvoker = async (request) => {
    if (request.phase === 'SEALED_JUDGMENT') invoked += 1;
    if (request.phase === 'REVISION' && fail) throw new Error('injected interruption');
    return fixture.invoke(request);
  };
  await assert.rejects(() => service.runBiocenoseRound(input), (error) => error.code === 'BIOCENOSE_RUNTIME_STEP_BLOCKED');
  assert.equal((await store.loadSession(db, community.communityId)).phase, 'DELIBERATION', 'failed step rolls back its phase mutation');
  assert.equal(invoked, 3);
  fail = false;
  const result = await service.runBiocenoseRound(input);
  const judgment = result.receipts.at(-1).result.judgment;
  assert.equal(judgment.status, 'DECIDED');
  assert.equal(judgment.decisionOutcome, 'VERIFIED_CONSENSUS');
  assert.equal(invoked, 3, 'recovery does not repeat completed model calls');
  assert.equal(result.receipts[2].result.verificationReceipts.length, 1, 'ordinary jury runs its supplied oracle');
  const repeated = await service.runBiocenoseRound(input);
  assert.equal(repeated.recovered, true);
  assert.equal(repeated.receipts.at(-1).result.judgmentId, result.receipts.at(-1).result.judgmentId);
  assert.equal(invoked, 3);
  assert.equal((await store.listEvents(db, community.communityId)).filter((event) => event.type === 'COMMUNITY_JUDGMENT_RECORDED').length, 1);
}

async function testRevisedForecastsAndStability(db) {
  const community = await fixture.prepare(db, { questionType: 'PROBABILISTIC', constitution: { roundLimit: 4,
    stoppingRule: { stableRounds: 2, stopWhenEvidenceValueIsLow: false } } });
  const input = fixture.runtimeInput(db, community.communityId);
  input.memberInvoker = async (request) => {
    if (request.phase !== 'REVISION') return fixture.invoke(request);
    return { previousPosition: 'initial', newPosition: 'revised', changedClaims: [request.context.claims[0].claimId],
      reasonCodes: ['NEW_EVIDENCE'], evidenceRefs: ['measurement'],
      probabilities: [{ eventId: 'event', domain: 'general', probability: 0.9 }] };
  };
  const result = await service.runBiocenoseRound(input);
  assert.equal(result.round, 1, 'two equal persisted aggregations satisfy stability before the round limit');
  assert.ok(Math.abs(result.receipts[6].result.estimates[0].probability - 0.9) < 1e-12);
  assert.equal(result.receipts.at(-1).result.judgment.stopReason, 'STABILITY');
}

async function testActionReceiptsAndIdempotency(db) {
  const community = await fixture.prepare(db);
  const input = fixture.runtimeInput(db, community.communityId);
  let calls = 0;
  input.actionExecutors = { HANDOFF_DIRECT: async (request) => {
    calls += 1;
    return { status: 'COMPLETED', receipt: { ...request, decision: undefined, status: 'VERIFIED', oracle: 'trusted' } };
  } };
  const first = await service.runBiocenoseRound(input);
  assert.equal(first.ecologicalAction.status, 'COMPLETED');
  await service.runBiocenoseRound(input);
  assert.equal(calls, 1);
  const other = await fixture.prepare(db);
  const unverified = await service.runBiocenoseRound({ ...input, communityId: other.communityId,
    actionExecutors: { HANDOFF_DIRECT: async () => ({ status: 'COMPLETED' }) } });
  assert.equal(unverified.ecologicalAction.status, 'BLOCKED');
  assert.equal(unverified.followUpStatus, 'ACTION_BLOCKED');
}

async function testLeaseAndTamperedJournal(db) {
  const community = await fixture.prepare(db);
  const input = fixture.runtimeInput(db, community.communityId);
  const lease = await leases.acquire(input);
  await assert.rejects(() => service.runBiocenoseRound(input), (error) => error.code === 'BIOCENOSE_RUNTIME_LEASE_CONFLICT');
  await leases.release(lease);
  await store.appendEvent(db, { communityId: community.communityId, type: 'DELIBERATION_STEP_COMPLETED',
    payload: { round: 0, step: 'collect_sealed_judgments', result: {}, resultHash: 'tampered', constitutionHash: 'tampered' }, patch: {} });
  await assert.rejects(() => service.runBiocenoseRound(input), (error) => error.code === 'BIOCENOSE_ROUND_INTEGRITY_FAILED');
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await testVerifiedExecutionAndRecovery(db);
    await testRevisedForecastsAndStability(db);
    await testActionReceiptsAndIdempotency(db);
    await testLeaseAndTamperedJournal(db);
  } finally { await db.close(); }
}

run().then(() => console.log('Biocenose completion: PASS')).catch((error) => {
  console.error(error); process.exitCode = 1;
});
