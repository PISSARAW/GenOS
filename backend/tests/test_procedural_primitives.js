'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const proceduralHandlers = require('../src/services/primitiveHandlers/proceduralHandlers');
const identity = require('../src/services/proceduralIdentityService');

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function makeParent() {
  return identity.sealOrganism({
    apiVersion: 'genos/v1alpha1',
    kind: 'ProceduralOrganism',
    metadata: { version: 1, parentId: null, lineageId: 'lineage-prim' },
    structure: {
      nodes: [
        { id: 'start', type: 'action', required: true, locked: true },
        { id: 'verify', type: 'gate', required: true, locked: true },
        { id: 'end', type: 'terminal', required: true },
      ],
      synapses: [
        { from: 'start', to: 'verify', type: 'excitatory', weight: 0.8 },
        { from: 'verify', to: 'end', type: 'excitatory', weight: 0.9 },
      ],
    },
    fitness: { score: 0.5, components: { success: 0.5, robustness: 0.5, evidence: 0.6, risk: 0.1, generalization: 0.4 } },
  });
}

async function testProceduralPrimitives() {
  const dbPath = path.join(__dirname, `test-procedural-prim-${Date.now()}.db`);
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(dbPath);
  const persistence = require('../src/services/proceduralPersistenceService');
  for (const stmt of persistence.TABLE_SQL.split(';').filter((s) => s.trim())) {
    await run(db, stmt);
  }

  // procedural_seal
  const sealResult = await proceduralHandlers.sealOrganism({
    organism: {
      apiVersion: 'genos/v1alpha1',
      kind: 'ProceduralOrganism',
      metadata: { version: 2, parentId: 'x' },
      structure: {
        nodes: [{ id: 'a', type: 'action' }, { id: 'b', type: 'terminal' }],
        synapses: [{ from: 'a', to: 'b', type: 'excitatory', weight: 0.5 }],
      },
    },
  });
  assert.strictEqual(sealResult.success, true, `seal must succeed: ${JSON.stringify(sealResult.validation)}`);

  // Persist a parent first (evolve expects a persisted parent for lineage)
  const parent = makeParent();
  const savedParent = await persistence.persistGenome(db, parent, { status: 'active' });

  // procedural_evolve
  const evolveResult = await proceduralHandlers.evolveOrganism({
    db,
    parent: savedParent,
    policy: { minEvidence: 0.5, minRobustness: 0.3, maxNodes: 100 },
    fitnessMetrics: () => ({ success: 0.9, robustness: 0.8, evidence: 0.9, generalization: 0.6, cost: 0.2, risk: 0.05, complexity: 0.3 }),
  });
  assert.strictEqual(evolveResult.success, true);
  assert.strictEqual(evolveResult.promoted, true, `evolve must promote: ${JSON.stringify(evolveResult.attempts.map((a) => ({ stage: a.stage, reason: a.reason })))}`);
  assert.ok(evolveResult.promotedId);

  // procedural_load
  const loadResult = await proceduralHandlers.loadOrganism({ db, versionId: evolveResult.promotedId });
  assert.strictEqual(loadResult.success, true);
  assert.strictEqual(loadResult.found, true);
  assert.strictEqual(loadResult.organism.metadata.id, evolveResult.promotedId);

  // procedural_phylogeny
  const phyloResult = await proceduralHandlers.phylogenyOrganism({ db, versionId: evolveResult.promotedId });
  assert.strictEqual(phyloResult.success, true);
  assert.strictEqual(phyloResult.ids.length, 2, `phylogeny [P0, P1], got ${phyloResult.ids.length}`);
  assert.strictEqual(phyloResult.ids[0], savedParent.metadata.id);

  // Handlers registry wiring: the Lot 16 aliases exist and delegate
  const { HANDLERS } = require('../src/services/primitiveHandlers/handlersRegistry');
  const aliases = ['procedural_evolve', 'organism_evolve', 'procedural_load', 'organism_load', 'procedural_phylogeny', 'organism_phylogeny', 'procedural_seal', 'organism_seal'];
  for (const alias of aliases) {
    assert.strictEqual(typeof HANDLERS[alias], 'function', `HANDLERS.${alias} must be a function`);
  }

  // Error paths
  const noDb = await proceduralHandlers.evolveOrganism({ parent: savedParent }).catch((e) => ({ error: e.message }));
  assert.ok(noDb.error.includes('database handle'), 'evolve without db must fail explicitly');
  const noVersionId = await proceduralHandlers.loadOrganism({ db });
  assert.strictEqual(noVersionId.success, false);

  db.close();
  fs.unlinkSync(dbPath);
  console.log('=== procedural primitives: all passed ===');
}

testProceduralPrimitives().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
