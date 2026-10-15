'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const store = require('../src/services/morphogenesis/morphogenesisEpochStore');
const { migrationRunners, runMigration } = require('../src/db/migrations/registry');

async function main() {
  const db = openDatabase();
  try {
    await db.exec('CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, description TEXT)');
    const migration = migrationRunners.find(entry => entry.name === '130-morphogenesis-epoch-store');
    assert.ok(migration, 'epoch persistence migration is registered');
    await runMigration(db, migration.name, migration.description);
    assert.equal((await db.get('SELECT version FROM schema_migrations WHERE version=?', migration.name)).version, migration.name);

    const first = payload({ expectedRevision: 0, idempotencyKey: 'epoch-1', epoch: 1 });
    const saved = await store.saveCheckpoint(db, first);
    assert.equal(saved.revision, 1);
    assert.deepEqual(await store.loadCheckpoint(db, scope()), saved);
    assert.deepEqual(await store.saveCheckpoint(db, first), saved, 'same idempotency key returns original checkpoint');

    const changedReplay = payload({ expectedRevision: 0, idempotencyKey: 'epoch-1', epoch: 2 });
    await assert.rejects(() => store.saveCheckpoint(db, changedReplay), error =>
      error.code === 'MORPHOGENESIS_CHECKPOINT_IDEMPOTENCY_CONFLICT');
    await assert.rejects(() => store.saveCheckpoint(db, payload({ expectedRevision: 0, idempotencyKey: 'epoch-2', epoch: 2 })), error =>
      error.code === 'MORPHOGENESIS_CHECKPOINT_REVISION_CONFLICT');

    const next = payload({ expectedRevision: 1, idempotencyKey: 'epoch-2', epoch: 2,
      state: { currentTopology: 'causal-microgroup' }, results: [{ status: 'observed' }],
      budget: { reserved: 4, spent: 2 }, barrier: { status: 'quiescent', receipt: 'barrier-2' } });
    const resumed = await store.saveCheckpoint(db, next);
    assert.deepEqual(await store.loadCheckpoint(db, scope()), resumed);
    assert.deepEqual(resumed.results, next.results);
    assert.deepEqual(resumed.budget, next.budget);
    assert.deepEqual(resumed.barrier, next.barrier);
    assert.equal(await store.loadCheckpoint(db, scope({ organizationId: 'other-org' })), null);
    await assert.rejects(() => store.saveCheckpoint(db, payload({ organizationId: 'other-org',
      expectedRevision: 0, idempotencyKey: 'other-scope-write', epoch: 1 })), error =>
      error.code === 'MORPHOGENESIS_CHECKPOINT_SCOPE_CONFLICT');
  } finally {
    await db.close();
  }
  console.log('Morphogenesis epoch checkpoints round-trip, replay idempotently, fence revisions and preserve tenant scope.');
}

function scope(overrides = {}) {
  return { missionId: 'epoch-store-mission', organizationId: 'org-a', projectId: 'project-a', ...overrides };
}

function payload(overrides = {}) {
  return { ...scope(overrides), epoch: 1, phase: 'executing', expectedRevision: 0,
    idempotencyKey: 'epoch-1', state: { currentTopology: 'parallel' }, results: [],
    budget: { reserved: 10, spent: 0 }, barrier: { status: 'waiting' }, ...overrides };
}

main().catch(error => { console.error(error); process.exitCode = 1; });
