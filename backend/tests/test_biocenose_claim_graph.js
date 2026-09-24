'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { prepareCommunity, commitJudgment, revealJudgments, publishClaim, listClaims } = require('../src/services/biocenoseService');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const prepared = await prepareCommunity({
    db, orchestratorId: 'orchestrator', mission: 'Assess the proposal',
    options: { population: { generators: 2, reviewers: 1, verifiers: 1 } }
  });
  const members = await db.all(
    `SELECT member_id FROM biocenose_members WHERE community_id = ? AND role != 'community_facilitator' ORDER BY member_id`,
    prepared.communityId
  );
  for (const member of members) {
    await commitJudgment({ db, communityId: prepared.communityId, memberId: member.member_id, judgment: {
      position: 'The proposal is acceptable.', claims: [], probabilities: [], assumptions: [],
      evidenceRefs: [], unknowns: [], abstentions: [], confidence: 0.7
    } });
  }
  await revealJudgments({ db, communityId: prepared.communityId, actorId: 'orchestrator' });
  const generators = await db.all(
    `SELECT member_id FROM biocenose_members WHERE community_id = ? AND role = 'generator' ORDER BY member_id`,
    prepared.communityId
  );
  const first = await publishClaim({
    db, communityId: prepared.communityId, memberId: generators[0].member_id,
    claim: { statement: 'The proposal reduces latency.' }
  });
  const duplicate = await publishClaim({
    db, communityId: prepared.communityId, memberId: generators[1].member_id,
    claim: { statement: '  THE   PROPOSAL reduces latency. ' }
  });
  const claims = await listClaims({ db, communityId: prepared.communityId });
  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.claimId, first.claimId);
  assert.equal(claims.length, 1);
  assert.deepEqual(new Set(claims[0].owners), new Set(generators.map((entry) => entry.member_id)));
  assert.equal((await db.all("SELECT event_type FROM biocenose_events WHERE event_type = 'CLAIM_PUBLISHED'")).length, 2);
  await db.close();
}

main().then(() => process.stdout.write('Biocenose claim graph checks: PASS\n')).catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
