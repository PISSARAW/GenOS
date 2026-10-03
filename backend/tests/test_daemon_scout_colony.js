'use strict';

const assert = require('node:assert/strict');
const scouts = require('../src/services/daemon/scouting/scoutColonyService');

async function main() {
  scouts.clearRegistry();
  const headSha = 'a'.repeat(40);
  const base = {
    cellId: 'scout.evidence-check',
    territory: { id: 'territory.scout-check', headSha, scopePath: '/' },
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
      provenanceRecordIds: ['prov.source-1'],
      findings: [{
        claim: 'The import target is absent',
        headSha,
        provenanceRecordIds: ['prov.source-1']
      }],
      tokensUsed: 0,
      analysisType: 'static'
    })
  });
  assert.equal(result.ran, true);
  assert.equal(result.headSha, headSha);
  assert.deepEqual(result.provenanceRecordIds, ['prov.source-1']);

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
      provenanceRecordIds: ['prov.source-1'],
      findings: [{ claim: 'Ungrounded statement', headSha, provenanceRecordIds: [] }],
      tokensUsed: 1
    })
  });
  assert.equal(ungrounded.ran, false);
  assert.ok(ungrounded.errors.includes('finding-provenance-required'));

  console.log('daemon scout colony: evidence requirements passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
