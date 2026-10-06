'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const biome = require('../src/services/biomeCoordinationService');

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const runtime = await biome.BiomeRuntime.create('Persist epistemic experiment niches', {
      db, variant: 'resource', maxTicks: 5
    });
    const experimentWave = { contracts: [{ experimentId: 'wave-niche', hypothesisId: 'h',
      tools: ['sql'], sourceRefs: ['artifact:wave'], verifierId: 'reviewer',
      utility: 1, cost: 1, intervention: { tool: 'sql' } }] };
    await runtime.step({ experimentWave, totalBudget: 10 });
    const before = await biome.sessionSnapshot(runtime.sessionId, { db });
    const niche = before.niches.find(item => item.entryConditions?.some(condition => condition.hypothesisId === 'h'));
    assert.ok(niche, 'the experiment niche must persist in the authoritative session');
    assert.equal(niche.carryingCapacity, 1);
    const restored = await biome.BiomeRuntime.restore(runtime.sessionId, 'resource', db);
    assert.deepEqual(restored.ecology.niches, before.niches);
    const rejected = { contracts: [{ ...experimentWave.contracts[0], hypothesisId: 'rejected' }] };
    await assert.rejects(() => restored.step({ experimentWave: rejected,
      populationResults: [{ id: 'bad-result', populationId: 'unknown', productivity: 1,
        evidenceRefs: ['artifact:invalid'] }] }), { code: 'BIOME_RESULT_INVALID' });
    assert.deepEqual(await biome.sessionSnapshot(runtime.sessionId, { db }), before,
      'failed cycles must roll back their experiment niches');
    console.log('Biome experiment wave persistence, restore and atomic rollback: PASS');
  } finally { await db.close(); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
