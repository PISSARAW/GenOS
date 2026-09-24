'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const store = require('../src/services/biocenose/communityStore');
const { prepareCommunity, commitJudgment, revealJudgments, publishClaim, publishArgument, argumentGraphSnapshot } = require('../src/services/biocenoseService');

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const community = await prepareCommunity({
      db, orchestratorId: 'orchestrator', mission: 'Assess this design',
      options: { population: { generators: 2, reviewers: 1, verifiers: 1 } }
    });
    const members = await store.participantIds(db, community.communityId);
    for (const memberId of members) await commitJudgment({ db, communityId: community.communityId, memberId, judgment: {
      position: 'Assess the design.', claims: [], probabilities: [], assumptions: [],
      evidenceRefs: [], unknowns: [], abstentions: [], confidence: 0.6
    } });
    await revealJudgments({ db, communityId: community.communityId, actorId: 'orchestrator' });
    const generators = members.filter((id) => id.startsWith('generator:'));
    const source = await publishClaim({ db, communityId: community.communityId, memberId: generators[0], claim: { statement: 'The design is safe.' } });
    const target = await publishClaim({ db, communityId: community.communityId, memberId: generators[1], claim: { statement: 'The design exposes credentials.' } });
    await store.appendEvent(db, {
      communityId: community.communityId, actorId: 'orchestrator', type: 'PHASE_CHANGED',
      payload: {}, patch: { phase: 'DELIBERATION' }
    });
    const edge = await publishArgument({
      db, communityId: community.communityId, memberId: members[0], claimId: source.claimId,
      relation: 'ATTACK', argument: { statement: 'The credential exposure contradicts the safety claim.', targetClaimId: target.claimId }
    });
    const graph = await argumentGraphSnapshot({ db, communityId: community.communityId });
    assert.equal(graph.claims.length, 2);
    assert.equal(graph.arguments.length, 1);
    assert.equal(graph.arguments[0].argumentId, edge.argumentId);
    assert.equal(graph.arguments[0].argument.targetClaimId, target.claimId);
  } finally {
    await db.close();
  }
}

run().then(() => process.stdout.write('Biocenose argument graph checks: PASS\n')).catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
