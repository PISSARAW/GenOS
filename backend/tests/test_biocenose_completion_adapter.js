'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const completionAdapters = require('../src/services/topologyCompletionAdapters');
const { closeMission } = require('../src/services/missionClosureService');
const { digest } = require('../src/services/evidenceContractService');
const communityStore = require('../src/services/biocenose/communityStore');
const roundJournal = require('../src/services/biocenose/runtime/roundJournal');
const biocenose = require('../src/services/biocenoseService');
const fixture = require('./helpers/biocenoseCompletionFixtures');
const { signedOracleReceipt } = require('./helpers/biocenoseHybridReceipt');

function workerProof(missionId) {
  const content = { missionId, workerId: 'worker-1',
    result: { status: 'completed', verified: true } };
  return { reference: digest(content), content };
}

function adapterInput(db, missionId, communityId) {
  const proof = workerProof(missionId);
  const context = { db, mode: 'biocenose', missionId,
    output: { complete: true }, ...(communityId ? { communityId } : {}) };
  return { context, evidence: {
    members: [{ workerId: 'worker-1', status: 'completed', evidenceRefs: [proof.reference] }],
    evidenceProofs: [proof]
  } };
}

async function createHybridDecision(db, missionId) {
  const community = await fixture.prepare(db, { missionId,
    variant: 'hybrid_oracle_community', questionType: 'FACTUAL' });
  const session = await communityStore.loadSession(db, community.communityId);
  await biocenose.runBiocenoseRound({ db, communityId: community.communityId,
    memberInvoker: fixture.invoke, isTrustedReceipt: () => true,
    verificationExecutor: async ({ claim, verifier }) => signedOracleReceipt({
      claim, verifier, session, receiptId: `oracle-${claim.claimId}`, independent: true
    }) });
  return community;
}

async function build(db, missionId, communityId) {
  return completionAdapters.build(adapterInput(db, missionId, communityId));
}

async function updateReviewReceipt(db, communityId, mutate) {
  const rows = await db.all(`SELECT event_id, payload_json FROM biocenose_events
    WHERE community_id = ? AND event_type = 'DELIBERATION_STEP_COMPLETED'
    ORDER BY revision`, communityId);
  const review = rows.map((item) => ({ ...item, payload: JSON.parse(item.payload_json) }))
    .find((item) => item.payload.step === 'review_and_verify');
  assert.ok(review);
  mutate(review.payload.result.verificationReceipts);
  review.payload.resultHash = roundJournal.digest(review.payload.result);
  await db.exec('DROP TRIGGER biocenose_events_no_update');
  await db.run('UPDATE biocenose_events SET payload_json = ? WHERE event_id = ?',
    JSON.stringify(review.payload), review.event_id);
}

async function verifyNominal(db) {
  const missionId = 'mission-biocenose-adapter-nominal';
  const community = await createHybridDecision(db, missionId);
  const input = await build(db, missionId, community.communityId);
  assert.equal(input.topologyValidation.status, 'verified');
  assert.equal(input.oracle.receipt.communityId, community.communityId);
  assert.ok(input.oracle.receipt.claimIds.length > 0);
  assert.equal(closeMission(input).verdict, 'succeeded');
}

async function verifyOtherMissionRejected(db) {
  const community = await fixture.prepare(db, { missionId: 'mission-owner' });
  const input = await build(db, 'mission-other', community.communityId);
  assert.equal(input.topologyValidation.status, 'failed');
  assert.deepEqual(input.topologyValidation.reasons, ['biocenose_mission_scope_mismatch']);
}

async function verifyNonTerminalIsPartial(db) {
  const missionId = 'mission-biocenose-adapter-active';
  const community = await fixture.prepare(db, { missionId,
    variant: 'human_ai_deliberation', questionType: 'MULTI_CRITERIA' });
  await biocenose.runBiocenoseRound(fixture.runtimeInput(db, community.communityId));
  const input = await build(db, missionId, community.communityId);
  assert.equal(input.topologyValidation.status, 'partial');
  assert.deepEqual(input.topologyValidation.reasons, ['biocenose_judgment_not_terminal']);
}

async function verifyMissingReceiptIsPartial(db) {
  const missionId = 'mission-biocenose-adapter-no-receipt';
  const community = await createHybridDecision(db, missionId);
  await updateReviewReceipt(db, community.communityId, (receipts) => receipts.splice(0));
  const input = await build(db, missionId, community.communityId);
  assert.equal(input.topologyValidation.status, 'partial');
  assert.deepEqual(input.topologyValidation.reasons, ['biocenose_hybrid_oracle_receipt_missing']);
}

async function verifyAlteredReceiptFails(db) {
  const missionId = 'mission-biocenose-adapter-altered-receipt';
  const community = await createHybridDecision(db, missionId);
  await updateReviewReceipt(db, community.communityId, (receipts) => {
    receipts[0].evidenceRef = 'proof:altered';
  });
  const input = await build(db, missionId, community.communityId);
  assert.equal(input.topologyValidation.status, 'failed');
  assert.deepEqual(input.topologyValidation.reasons, ['biocenose_hybrid_oracle_receipt_invalid']);
}

async function verifyQuorumAloneIsPartial(db) {
  const missionId = 'mission-biocenose-adapter-quorum-only';
  const community = await fixture.prepare(db, { missionId, variant: 'epistemic_jury' });
  await biocenose.runBiocenoseRound(fixture.runtimeInput(db, community.communityId));
  const input = await build(db, missionId, community.communityId);
  assert.equal(input.topologyValidation.status, 'partial');
  assert.deepEqual(input.topologyValidation.reasons, ['biocenose_independent_oracle_unavailable']);
  assert.equal(input.oracle, null);
}

async function run() {
  const previousKey = process.env.GENOS_EPISTEMIC_RECEIPT_SECRET;
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'biocenose-completion-adapter-test';
  const tests = [verifyNominal, verifyOtherMissionRejected, verifyNonTerminalIsPartial,
    verifyMissingReceiptIsPartial, verifyAlteredReceiptFails, verifyQuorumAloneIsPartial];
  try {
    for (const test of tests) {
      const db = await open({ filename: ':memory:', driver: sqlite3.Database });
      try { await test(db); } finally { await db.close(); }
    }
  } finally {
    if (previousKey === undefined) delete process.env.GENOS_EPISTEMIC_RECEIPT_SECRET;
    else process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = previousKey;
  }
  console.log('Biocenose completion adapter: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
