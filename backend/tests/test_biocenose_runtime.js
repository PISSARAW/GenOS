'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const store = require('../src/services/biocenose/communityStore');
const biocenose = require('../src/services/biocenoseService');
const { ROUND_STEPS } = require('../src/services/biocenose/runtime/deliberationPlanner');

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const community = await biocenose.prepareCommunity({ db, orchestratorId: 'orchestrator', mission: 'Evaluate evidence.' });
    const handlers = Object.fromEntries(ROUND_STEPS.map((step) => [step, async (context) => ({ completed: context.step })]));
    const result = await biocenose.runBiocenoseRound({ db, communityId: community.communityId, handlers });
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.receipts.length, ROUND_STEPS.length);
    const events = await store.listEvents(db, community.communityId);
    assert.equal(events.filter((event) => event.type === 'DELIBERATION_STEP_COMPLETED').length, ROUND_STEPS.length);
    await assert.rejects(() => biocenose.runBiocenoseRound({ db, communityId: community.communityId, handlers: {} }),
      (error) => error.code === 'BIOCENOSE_RUNTIME_STEP_BLOCKED');
    assert.equal((await store.listEvents(db, community.communityId)).filter((event) => event.type === 'DELIBERATION_STEP_BLOCKED').length, 1);
  } finally {
    await db.close();
  }
}

async function benchmark() {
  const score = biocenose.summarizeBiocenoseBenchmark([
    { evaluated: true, consensusReached: true, correct: false, correctMinority: true, preserved: false, tokenCount: 10 },
    { evaluated: true, consensusReached: true, correct: true, correctMinority: true, preserved: true, tokenCount: 20 },
    { evaluated: false, tokenCount: 100 }
  ]);
  assert.equal(score.falseConsensusRate, 0.5);
  assert.equal(score.correctMinorityPreservationRate, 0.5);
  assert.equal(score.tokenCount, 30);
}

Promise.all([run(), benchmark()]).then(() => process.stdout.write('Biocenose runtime/benchmark checks: PASS\n')).catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
