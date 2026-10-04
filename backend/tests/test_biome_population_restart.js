'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

const servicePath = require.resolve('../src/services/biomeCoordinationService');

async function openDatabase(filename) {
  return open({ filename, driver: sqlite3.Database });
}

async function run() {
  const filename = path.join(os.tmpdir(), `genos-biome-restart-${process.pid}-${Date.now()}.db`);
  let db = await openDatabase(filename);
  try {
    const biome = require(servicePath);
    const session = await biome.composeBiome('Restart population with its lineage.', {
      db,
      scope: 'persistent',
      persistenceKey: `population-${process.pid}-${Date.now()}`,
      environment: { opportunities: [{ id: 'lineage', descriptor: 'lineage records', opportunityScore: 0.9,
        evidenceRefs: ['artifact:lineage'], requiredCapabilities: ['lineage-review'] }] },
    });
    await biome.discoverSessionNiches(session.sessionId, [], { db });
    await biome.updateNicheLifecycle({ sessionId: session.sessionId, nicheId: 'niche-lineage', options: { db } });
    await biome.updateSessionPopulation({ sessionId: session.sessionId, options: { db }, command: {
      type: 'create', population: { populationId: 'lineage-reviewers', nicheId: 'niche-lineage' },
    } });
    const spawned = await biome.updateSessionPopulation({ sessionId: session.sessionId, options: { db }, command: {
      type: 'spawn', populationId: 'lineage-reviewers', individuals: [{
        individualId: 'reviewer-a', capabilities: ['lineage-review'], genome: { genomeRef: 'genome-reviewer-a' },
        fitnessReceipts: [{ score: 0.91, evidenceRef: 'benchmark:lineage-1' }],
      }],
    } });
    assert.equal(spawned.spawned.length, 1);
    await db.close();

    delete require.cache[servicePath];
    db = await openDatabase(filename);
    const restartedBiome = require(servicePath);
    const restored = await restartedBiome.sessionSnapshot(session.sessionId, { db });
    const restoredRecord = await require('../src/services/biome/biomeSessionStore').load(db, session.sessionId);
    const restoredIndividual = restored.populations[0].individuals[0];
    assert.equal(restoredIndividual.individualId, 'reviewer-a');
    assert.deepEqual(restoredIndividual.capabilities, ['lineage-review']);
    assert.equal(restoredIndividual.genome.genomeRef, 'genome-reviewer-a');
    assert.equal(restoredIndividual.fitnessReceipts[0].evidenceRef, 'benchmark:lineage-1');
    assert.ok(restoredRecord.revision >= 4);
    console.log('Biome population lineage and measured fitness survive SQLite restart.');
  } finally {
    if (db) await db.close();
    await fs.rm(filename, { force: true });
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
