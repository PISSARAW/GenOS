'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const biocenose = require('../src/services/biocenoseService');
const store = require('../src/services/biocenose/communityStore');
const commitmentService = require('../src/services/biocenose/deliberation/commitmentService');

function judgment(position) {
  return {
    position, claims: [{ statement: `${position} is supported.` }], probabilities: [],
    assumptions: [], evidenceRefs: [], unknowns: [], abstentions: [], confidence: 0.7
  };
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const community = await biocenose.prepareCommunity({
      db, orchestratorId: 'orchestrator-1', mission: 'Compare two implementation options.',
      options: { population: { generators: 2, reviewers: 1, verifiers: 1 } }
    });
    const participants = await store.participantIds(db, community.communityId);
    assert.equal(participants.length, 4);

    const first = await commitmentService.commitJudgment({
      db, communityId: community.communityId, memberId: participants[0], judgment: judgment('option-a')
    });
    assert.equal(first.remainingCount, 3);
    assert.equal(Object.hasOwn(first, 'judgment'), false);
    await assert.rejects(() => commitmentService.revealJudgments({ db, communityId: community.communityId }),
      (error) => error.code === 'BIOCENOSE_DISCLOSURE_BLOCKED');
    await assert.rejects(() => commitmentService.commitJudgment({
      db, communityId: community.communityId, memberId: participants[0], judgment: judgment('changed')
    }), (error) => error.code === 'BIOCENOSE_COMMIT_REJECTED');

    for (const memberId of participants.slice(1)) {
      await commitmentService.commitJudgment({ db, communityId: community.communityId, memberId, judgment: judgment(memberId) });
    }
    const metadata = await store.listCommitments(db, community.communityId, 0);
    assert.equal(metadata.length, 4);
    assert.equal(Object.hasOwn(metadata[0], 'payload'), false);
    const revealed = await commitmentService.revealJudgments({ db, communityId: community.communityId });
    assert.equal(revealed.length, 4);
    assert.equal((await store.loadSession(db, community.communityId)).phase, 'REVIEW');
    assert.equal((await store.listEvents(db, community.communityId)).at(-1).type, 'JUDGMENTS_REVEALED');
    await assert.rejects(() => commitmentService.commitJudgment({
      db, communityId: community.communityId, memberId: participants[0], judgment: judgment('late')
    }), (error) => error.code === 'BIOCENOSE_COMMIT_REJECTED');
    console.log('Biocenose sealed judgment checks: PASS');
  } finally {
    await db.close();
  }
}

run().catch((error) => {
  console.error('Biocenose sealed judgment checks failed:', error);
  process.exitCode = 1;
});
