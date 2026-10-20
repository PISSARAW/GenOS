'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { createFabric, migrateGqwf } = require('../src/services/gqwf');
const metadataStore = require('../src/services/gqwf/metadataStore');
const { RETAINED_REF_COUNT } = require('../src/services/gqwf/catalogMaintenance');

async function fixture() {
  const parent = path.resolve(__dirname, '../../.genos-agent-worlds/gqwf-catalog-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'maintenance-'));
  const workspacePath = path.join(root, 'workspace');
  await fs.mkdir(workspacePath);
  await fs.writeFile(path.join(workspacePath, 'source.txt'), 'catalog maintenance');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT NOT NULL,
      organization_id TEXT, project_id TEXT);`);
  await db.run('INSERT INTO workspaces VALUES (?, ?, ?, ?)',
    'ws-catalog', workspacePath, 'organization-a', 'project-a');
  await migrateGqwf(db);
  return { db, fabric: createFabric(db), parent, root, workspacePath };
}

async function seeded(context) {
  const base = await context.fabric.importBase({ workspaceId: 'ws-catalog' });
  await context.fabric.initializeHead({ workspaceId: 'ws-catalog', name: 'main',
    rootHash: base.rootHash });
  return base;
}

async function exerciseCrashReconciliation(context) {
  await seeded(context);
  const before = await metadataStore.listRefs(context.workspacePath);
  const missing = before[0];
  await fs.unlink(missing.path);
  const recovered = await context.fabric.maintainMetadataCatalog({ workspaceId: 'ws-catalog' });
  assert.equal(recovered.protocol, 'gqwf-catalog-maintenance-v1');
  assert.equal(recovered.republished, true);
  assert.equal(recovered.revision, missing.revision);
  assert.equal(recovered.catalogHash, missing.catalogHash);
  const replay = await context.fabric.maintainMetadataCatalog({ workspaceId: 'ws-catalog' });
  assert.equal(replay.republished, false);
  assert.equal(replay.revision, missing.revision);
}

async function exerciseRetention(context) {
  await context.fabric.importBase({ workspaceId: 'ws-catalog' });
  const oldest = (await metadataStore.listRefs(context.workspacePath))[0];
  for (let index = 0; index < RETAINED_REF_COUNT + 3; index += 1) {
    await context.fabric.checkpointMetadata({ workspaceId: 'ws-catalog' });
  }
  const refs = await metadataStore.listRefs(context.workspacePath);
  assert.equal(refs.length, RETAINED_REF_COUNT);
  assert.equal(refs.at(-1).revision, refs[0].revision - RETAINED_REF_COUNT + 1);
  assert.equal(refs.some((ref) => ref.revision === oldest.revision), false);
  await fs.access(metadataStore.objectPath(context.workspacePath, oldest.catalogHash));
}

async function exerciseForkRefusal(context) {
  await seeded(context);
  const latest = (await metadataStore.listRefs(context.workspacePath))[0];
  await metadataStore.writeRef(context.workspacePath, {
    protocol: 'gqwf-catalog-ref-v1', workspaceId: 'ws-catalog',
    revision: latest.revision, catalogHash: 'f'.repeat(64)
  });
  await assert.rejects(context.fabric.maintainMetadataCatalog({
    workspaceId: 'ws-catalog'
  }), /forked ref revision/);
}

async function exerciseCorruptStateRefusal(context) {
  await seeded(context);
  const latest = (await metadataStore.listRefs(context.workspacePath))[0];
  await fs.unlink(latest.path);
  await fs.writeFile(metadataStore.objectPath(context.workspacePath, latest.catalogHash), '{}');
  await assert.rejects(context.fabric.maintainMetadataCatalog({
    workspaceId: 'ws-catalog'
  }), /integrity check failed/);
}

async function run(exercise) {
  const context = await fixture();
  try { await exercise(context); } finally {
    await context.db.close();
    assert.equal(path.dirname(context.root), context.parent);
    await fs.rm(context.root, { recursive: true, force: true });
  }
}

async function main() {
  await run(exerciseCrashReconciliation);
  await run(exerciseRetention);
  await run(exerciseForkRefusal);
  await run(exerciseCorruptStateRefusal);
  console.log('GQWF metadata catalog maintenance: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
