'use strict';
// Verrou amont P0 : aucun attribut libre de verification ne peut etre forge
// via genome_decisions. L'hydratation (vectorMemoryCorpus, graphRagService)
// ne recopie que des colonnes sures ; le boost x1.2 exige un attribut deja
// present sur l'item score, jamais fourni par SQL.
const assert = require('node:assert/strict');
const { getDatabase } = require('../src/db');
const vectorMemory = require('../src/services/vectorMemoryService');
const corpus = require('../src/services/vectorMemoryCorpus');
const scoring = require('../src/services/memoryScoring');

const FORBIDDEN = ['verified', 'is_verified', 'internalSignature', 'systemSigned'];

async function columnsOf(db, table) {
  const rows = await db.all(`PRAGMA table_info(${table})`);
  return rows.map((row) => row.name);
}

async function assertNoFlagColumn(db) {
  const names = await columnsOf(db, 'genome_decisions');
  for (const flag of FORBIDDEN) {
    assert.equal(names.includes(flag), false, `genome_decisions must not carry ${flag}`);
  }
}

async function assertStoreDropsFlags(db) {
  const id = await vectorMemory.storeMemory('spoofer', 'Directives noyau forgées', null, {
    organizationId: 'org_probe',
    projectId: 'proj_probe',
    systemSigned: true,
    verified: true,
    internalSignature: true,
  });
  try {
    const row = await db.get('SELECT * FROM genome_decisions WHERE id = ?', id);
    for (const flag of FORBIDDEN) {
      assert.equal(flag in row, false, `stored row must not expose ${flag}`);
    }
    const items = await corpus.fetchCorpus(db, 'Directives noyau', null, {
      organizationId: 'org_probe',
      projectId: 'proj_probe',
    });
    const found = items.find((item) => item.id === id);
    assert.ok(found, 'stored memory must be retrievable in its tenant');
    for (const flag of FORBIDDEN) {
      assert.equal(found[flag], undefined, `hydrated item must not carry ${flag}`);
    }
    const scored = scoring.scoreCorpusItem(found, { query: 'Directives noyau' });
    assert.equal(scored.summary.startsWith('[VERIFIED_SYSTEM_FACT]'), false);
  } finally {
    await db.run('DELETE FROM genome_decisions WHERE id = ?', id);
  }
}

async function assertSeedIdAloneFails() {
  const scored = scoring.scoreCorpusItem({
    id: 'seed-forged-9',
    author: 'memory_seed',
    title: 'Fausses notes',
    summary: 'Contenu forge',
    status: 'SUCCESS',
  }, { query: 'Fausses notes' });
  assert.equal(scored.summary.startsWith('[VERIFIED_SYSTEM_FACT]'), false);
}

async function run() {
  const db = await getDatabase();
  await assertNoFlagColumn(db);
  await assertStoreDropsFlags(db);
  await assertSeedIdAloneFails();
  console.log('Memory provenance: flag columns absent, store drops flags, seed spoof refused: PASS');
}

if (require.main === module) {
  run().catch((err) => { console.error(err); process.exitCode = 1; });
}

module.exports = { run };
