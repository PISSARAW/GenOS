'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const persistence = require('../src/services/proceduralPersistenceService');
const identity = require('../src/services/proceduralIdentityService');

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function makeOrg(overrides = {}) {
  const baseMetadata = { id: 'test-org', version: 1, parentId: null, lineageId: 'lineage-1' };
  const mergedMetadata = { ...baseMetadata, ...(overrides.metadata || {}) };
  if (!mergedMetadata.id) {
    mergedMetadata.id = 'test-org';
  }
  const base = {
    apiVersion: 'genos/v1alpha1',
    kind: 'ProceduralOrganism',
    metadata: mergedMetadata,
    structure: {
      nodes: [{ id: 'inspect', type: 'action' }, { id: 'patch', type: 'action' }],
      synapses: [{ from: 'inspect', to: 'patch', type: 'excitatory', weight: 1.0 }],
    },
  };
  // Merge overrides but exclude metadata since we already handled it
  const { metadata: _meta, ...restOverrides } = overrides;
  return { ...base, ...restOverrides };
}

async function testPersistence() {
  const dbPath = path.join(__dirname, `test-procedural-${Date.now()}.db`);
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(dbPath);

  const statements = persistence.TABLE_SQL.split(';').filter(s => s.trim());
  for (const stmt of statements) {
    await run(db, stmt);
  }

  const testOrg = makeOrg({
    metadata: { parentId: null, version: 1, lineageId: 'lineage-1' },
    structure: {
      nodes: [{ id: 'inspect', type: 'action' }, { id: 'patch', type: 'action' }],
      synapses: [{ from: 'inspect', to: 'patch', type: 'excitatory', weight: 1.0 }],
    },
    fitness: { score: 0.85, components: { success: 0.9 } },
    plasticity: { lastEpisode: 42 },
  });

  const saved = await persistence.persistGenome(db, testOrg, { status: 'active' });
  assert.ok(saved.metadata.id, 'saved should have id');
  assert.strictEqual(saved.metadata.version, 1);

  const raw = await get(db, 'SELECT version_id, organism_json FROM procedural_genomes WHERE version_id = ?', [saved.metadata.id]);
  assert.ok(raw, 'raw row should exist');
  assert.ok(raw.organism_json, 'organism_json should exist');

  const loaded = await persistence.loadGenome(db, saved.metadata.id);
  assert.ok(loaded, 'loaded should not be null');
  assert.strictEqual(loaded.metadata.id, saved.metadata.id);
  assert.ok(loaded.fitness.score > 0.8);

  const phylogeny = await persistence.getPhylogeny(db, saved.metadata.id);
  assert.ok(Array.isArray(phylogeny));

  const orgV2Structure = {
    nodes: [{ id: 'inspect', type: 'action' }, { id: 'reproduce', type: 'action' }, { id: 'patch', type: 'action' }],
    synapses: [{ from: 'inspect', to: 'reproduce', type: 'excitatory', weight: 1.0 }],
  };
  const orgV2 = makeOrg({
    metadata: { parentId: saved.metadata.id, version: 2, lineageId: 'lineage-1' },
    structure: orgV2Structure,
    fitness: { score: 0.9, components: { success: 0.95 } },
    plasticity: { lastEpisode: 50 },
  });
  const savedV2 = await persistence.persistGenome(db, orgV2, { status: 'active' });
  assert.notStrictEqual(savedV2.metadata.id, saved.metadata.id);
  const phylogenyV2 = await persistence.getPhylogeny(db, savedV2.metadata.id);
  assert.strictEqual(phylogenyV2.length, 2);

  await persistence.updateGenomeStatus(db, saved.metadata.id, 'archived');
  const active = await persistence.listActiveGenomes(db);
  assert.ok(active.length >= 1);

  db.close();
  fs.unlinkSync(dbPath);
  console.log('=== procedural persistence: all passed ===');
}

testPersistence().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
