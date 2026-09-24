'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const store = require('../src/services/biocenose/communityStore');
const biocenose = require('../src/services/biocenoseService');

async function makeAggregationReady(db, mission) {
  const community = await biocenose.prepareCommunity({ db, orchestratorId: 'orchestrator', mission });
  await store.appendEvent(db, {
    communityId: community.communityId, actorId: 'orchestrator', type: 'PHASE_CHANGED', payload: {},
    patch: { phase: 'AGGREGATION' }
  });
  return community;
}

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const pending = await makeAggregationReady(db, 'Resolve the claim');
    const stillOpen = await biocenose.finalizeCommunityJudgment({
      db, communityId: pending.communityId, actorId: 'orchestrator',
      aggregation: { questionType: 'FACTUAL', outcome: 'UNRESOLVED', unresolvedClaimIds: ['claim-1'] },
      stopping: { stableRoundCount: 0 }
    });
    assert.equal(stillOpen.finalized, false);
    const unresolved = await biocenose.finalizeCommunityJudgment({
      db, communityId: pending.communityId, actorId: 'orchestrator',
      aggregation: { questionType: 'FACTUAL', outcome: 'UNRESOLVED', unresolvedClaimIds: ['claim-1'] },
      uncertainty: 0.8, stopping: { stableRoundCount: 1 }
    });
    assert.equal(unresolved.judgment.status, 'IRREDUCIBLE_DISAGREEMENT');
    assert.equal((await store.loadSession(db, pending.communityId)).phase, 'ESCALATED');

    const resolved = await makeAggregationReady(db, 'Choose between options');
    const decision = await biocenose.finalizeCommunityJudgment({
      db, communityId: resolved.communityId, actorId: 'orchestrator',
      aggregation: { questionType: 'MULTI_CRITERIA', outcome: 'PARETO_FRONT', options: ['a'] },
      uncertainty: 0.1, stopping: { stableRoundCount: 1 }
    });
    assert.equal(decision.judgment.status, 'DECIDED');
    assert.equal((await store.loadSession(db, resolved.communityId)).phase, 'DECIDED');
  } finally {
    await db.close();
  }
}

run().then(() => process.stdout.write('Biocenose judgment/stopping checks: PASS\n')).catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
