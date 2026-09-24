'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const store = require('../src/services/biocenose/communityStore');
const biocenose = require('../src/services/biocenoseService');

async function setup(db) {
  const community = await biocenose.prepareCommunity({
    db, orchestratorId: 'orchestrator', mission: 'Assess the claim',
    options: { population: { generators: 2, reviewers: 1, verifiers: 1 } }
  });
  const members = await store.participantIds(db, community.communityId);
  for (const memberId of members) await biocenose.commitJudgment({ db, communityId: community.communityId, memberId, judgment: {
    position: 'Initial position.', claims: [], probabilities: [], assumptions: [],
    evidenceRefs: [], unknowns: [], abstentions: [], confidence: 0.6
  } });
  await biocenose.revealJudgments({ db, communityId: community.communityId, actorId: 'orchestrator' });
  const claim = await biocenose.publishClaim({ db, communityId: community.communityId, memberId: members[0], claim: { statement: 'The component is safe.' } });
  await store.appendEvent(db, { communityId: community.communityId, actorId: 'orchestrator', type: 'PHASE_CHANGED', payload: {}, patch: { phase: 'DELIBERATION' } });
  await store.appendEvent(db, { communityId: community.communityId, actorId: 'orchestrator', type: 'PHASE_CHANGED', payload: {}, patch: { phase: 'REVISION' } });
  return { community, members, claim };
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const { community, members, claim } = await setup(db);
    const grounded = await biocenose.reviseBelief({
      db, communityId: community.communityId, memberId: members[0],
      previousPosition: 'Unsafe.', newPosition: 'Likely safe.', changedClaims: [claim.claimId],
      reasonCodes: ['NEW_EVIDENCE'], evidenceRefs: ['test-7']
    });
    assert.equal(grounded.rationale.evidenceGrounded, true);
    const social = await biocenose.reviseBelief({
      db, communityId: community.communityId, memberId: members[1],
      previousPosition: 'Unsafe.', newPosition: 'Likely safe.', changedClaims: [claim.claimId],
      reasonCodes: ['MAJORITY_SIGNAL'], evidenceRefs: []
    });
    assert.equal(social.conformitySignal, true);
    assert.equal(social.groupthinkRisk, true);
    await assert.rejects(() => biocenose.reviseBelief({
      db, communityId: community.communityId, memberId: members[2],
      previousPosition: 'Unsafe.', newPosition: 'Likely safe.', changedClaims: [claim.claimId],
      reasonCodes: ['AUTHORITY_SIGNAL'], evidenceRefs: [], criticalClaims: [claim.claimId]
    }), (error) => error.code === 'BIOCENOSE_SOCIAL_REVISION_BLOCKED');
  } finally {
    await db.close();
  }
}

run().then(() => process.stdout.write('Biocenose belief revision checks: PASS\n')).catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
