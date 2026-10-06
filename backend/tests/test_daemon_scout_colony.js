'use strict';

const assert = require('node:assert/strict');
const { fixture, closeFixture } = require('./helpers/daemonCompletionFixture');
const scouts = require('../src/services/daemon/scouting/scoutColonyService');

async function main() {
  scouts.clearRegistry();
  const value = await fixture();
  const headSha = 'a'.repeat(40);
  const provenance = await require('../src/services/daemon/verification/observationReceiptService').record(value.db, {
    findingId: 'scout-source', territoryId: value.context.territoryId, headSha, claim: 'Observed missing import' });
  const stranger = await scouts.spawnColony({ db: value.db, daemonId: 'daemon.stranger', request: {
    territoryId: value.context.territoryId, observationGoal: 'Inspect source evidence' } });
  assert.deepEqual(stranger.errors, ['registered-territory-owner-required']);
  const spawned = await scouts.spawnColony({ db: value.db, daemonId: value.context.daemonId, request: { territoryId: value.context.territoryId, observationGoal: 'Inspect source evidence', maxCells: 4, llmRatio: 0 } });
  assert.equal(spawned.spawned, true);
  const base = {
    db: value.db, colonyId: spawned.colony.id,
    cellId: 'scout.evidence-check',
    territory: { id: value.context.territoryId, headSha, scopePath: '/' },
    goal: 'Inspect source evidence'
  };

  const unavailable = await scouts.runScoutCell(base);
  assert.equal(unavailable.ran, false);
  assert.deepEqual(unavailable.errors, ['evidence-backed-analyzer-required']);
  assert.equal(scouts.getCell(base.cellId), null);

  const result = await scouts.runScoutCell({
    ...base,
    analyze: async () => ({
      headSha,
      provenanceRecordIds: [provenance],
      findings: [{
        claim: 'The import target is absent',
        headSha,
        provenanceRecordIds: [provenance]
      }],
      tokensUsed: 0,
      analysisType: 'static'
    })
  });
  assert.equal(result.ran, true);
  assert.equal(result.headSha, headSha);
  assert.deepEqual(result.provenanceRecordIds, [provenance]);

  const stale = await scouts.runScoutCell({
    ...base,
    cellId: 'scout.stale-check',
    analyze: async () => ({ headSha: 'b'.repeat(40), provenanceRecordIds: ['prov.old'], findings: [], tokensUsed: 1 })
  });
  assert.equal(stale.ran, false);
  assert.ok(stale.errors.includes('analysis-head-mismatch'));

  const ungrounded = await scouts.runScoutCell({
    ...base,
    cellId: 'scout.ungrounded-check',
    analyze: async () => ({
      headSha,
      provenanceRecordIds: [provenance],
      findings: [{ claim: 'Ungrounded statement', headSha, provenanceRecordIds: [] }],
      tokensUsed: 1
    })
  });
  assert.equal(ungrounded.ran, false);
  assert.ok(ungrounded.errors.includes('finding-provenance-required'));

  const forged = await scouts.runScoutCell({ ...base, cellId: 'scout.forged', analyze: async () => ({
    headSha, provenanceRecordIds: ['not-persisted'], findings: [], tokensUsed: 0 }) });
  assert.deepEqual(forged.errors, ['analysis-provenance-not-persisted']);
  scouts.clearRegistry();
  await scouts.loadColonies(value.db);
  assert.equal(scouts.getCell(base.cellId).state, 'COMPLETE');
  assert.equal((await value.db.get('SELECT COUNT(*) AS n FROM daemon_scout_cells')).n, 4);
  const limited = await scouts.runScoutCell({ ...base, cellId: 'scout.limit', analyze: async () => { throw new Error('must not execute'); } });
  assert.deepEqual(limited.errors, ['colony-cell-limit']);
  await scouts.dissolveColony({ db: value.db, colonyId: base.colonyId, reason: 'test-complete' });
  assert.equal(scouts.listActiveColonies().length, 0);
  await closeFixture(value);
  console.log('daemon scout colony: evidence requirements passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
