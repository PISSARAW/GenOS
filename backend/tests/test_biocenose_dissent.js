'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const store = require('../src/services/biocenose/communityStore');
const biocenose = require('../src/services/biocenoseService');

async function prepare(db) {
  const community = await biocenose.prepareCommunity({
    db, orchestratorId: 'orchestrator', mission: 'Assess this proposal',
    options: { population: { generators: 2, reviewers: 1, verifiers: 1 } }
  });
  const members = await store.participantIds(db, community.communityId);
  for (const memberId of members) await biocenose.commitJudgment({
    db, communityId: community.communityId, memberId, judgment: {
      position: 'Assess the proposal.', claims: [], probabilities: [], assumptions: [],
      evidenceRefs: [], unknowns: [], abstentions: [], confidence: 0.7
    }
  });
  await biocenose.revealJudgments({ db, communityId: community.communityId, actorId: 'orchestrator' });
  const claim = await biocenose.publishClaim({
    db, communityId: community.communityId, memberId: members[0], claim: { statement: 'The change is safe.' }
  });
  await store.appendEvent(db, {
    communityId: community.communityId, actorId: 'orchestrator', type: 'PHASE_CHANGED', payload: {},
    patch: { phase: 'DELIBERATION' }
  });
  return { community, members, claim };
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const { community, members, claim } = await prepare(db);
    const record = await biocenose.recordDissent({
      db, communityId: community.communityId, actorId: members[0], dissent: {
        claimRefs: [claim.claimId], supportingMembers: [members[1]], evidenceRefs: ['test-failure-1'],
        independence: 0.9, materiality: 1, severity: 1, reason: 'A reproducible critical failure.'
      }
    });
    assert.equal(record.status, 'OPEN');
    assert.equal(biocenose.evaluateMinorityEvidenceVeto({ dissent: record, receipts: [] }).promotion, 'REVIEW_REQUIRED');
    const receipt = {
      receiptId: 'receipt-1', evidenceRef: 'test-failure-1', outcome: 'REPRODUCIBLE_FAILURE', status: 'VERIFIED'
    };
    const veto = biocenose.evaluateMinorityEvidenceVeto({
      dissent: record, receipts: [receipt], isTrustedReceipt: (value) => value.receiptId === receipt.receiptId
    });
    assert.equal(veto.promotion, 'PROMOTION_BLOCKED');
    await biocenose.changeDissentStatus({
      db, communityId: community.communityId, actorId: members[0], dissentId: record.dissentId,
      status: 'PRESERVED', reason: 'Evidence remains unresolved.'
    });
    assert.equal((await biocenose.listDissent({ db, communityId: community.communityId }))[0].status, 'PRESERVED');
  } finally {
    await db.close();
  }
}

run().then(() => process.stdout.write('Biocenose dissent checks: PASS\n')).catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
