'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { createFabric, migrateGqwf } = require('../src/services/gqwf');
const catalog = require('../src/services/gqwf/catalog');
const metadataStore = require('../src/services/gqwf/metadataStore');

function authorization(request) {
  return { ...request, allowed: true, evidenceId: 'metadata-recovery-policy' };
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function closureInput(base) {
  return {
    workspaceId: 'ws-metadata', rootHash: base.rootHash,
    command: { executable: 'node', arguments: ['tests/recover.js'] },
    runtime: { name: 'node', version: '24.18.0', digest: digest('node-runtime') },
    dependencies: [
      { name: 'sqlite', version: '5.1.7', digest: digest('sqlite-runtime') }
    ],
    environment: [{ name: 'CI', valueHash: digest('true') }]
  };
}

async function fixture() {
  const parent = path.resolve(__dirname, '../../.genos-agent-worlds/gqwf-metadata-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'metadata-'));
  const workspacePath = path.join(root, 'workspace');
  await fs.mkdir(workspacePath);
  await fs.writeFile(path.join(workspacePath, 'source.txt'), 'catalogued');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT NOT NULL,
      organization_id TEXT, project_id TEXT);`);
  await db.run('INSERT INTO workspaces VALUES (?, ?, ?, ?)',
    'ws-metadata', workspacePath, 'organization-a', 'project-a');
  await migrateGqwf(db);
  const fabric = createFabric(db, { authorizeMetadataRepair: authorization });
  return { db, fabric, parent, root, workspacePath };
}

async function seeded(context, release = true) {
  const base = await context.fabric.importBase({ workspaceId: 'ws-metadata' });
  await context.fabric.initializeHead({ workspaceId: 'ws-metadata', name: 'main',
    rootHash: base.rootHash });
  const lease = await context.fabric.materializeRoot({ workspaceId: 'ws-metadata',
    rootHash: base.rootHash });
  if (release) {
    await context.fabric.releaseLease({ workspaceId: 'ws-metadata', leaseId: lease.leaseId });
  }
  const closure = await context.fabric.sealExecutionClosure(closureInput(base));
  return { base, lease, closure };
}

async function eraseCatalogRows(context) {
  await context.db.exec(`PRAGMA foreign_keys = OFF;
    DELETE FROM gqwf_leases;
    DELETE FROM gqwf_heads;
    DELETE FROM gqwf_execution_closures;
    DELETE FROM gqwf_roots;
    DELETE FROM gqwf_catalog_state;
    PRAGMA foreign_keys = ON;`);
}

async function exerciseRecovery(context) {
  const state = await seeded(context);
  const latest = await catalog.latestCatalog(context.db, 'ws-metadata');
  assert.ok(latest.ref.revision >= 5);
  assert.equal(latest.catalog.protocol, 'gqwf-catalog-v2');
  assert.equal(latest.catalog.roots[0].rootHash, state.base.rootHash);
  assert.equal(latest.catalog.executionClosures[0].closureHash,
    state.closure.closureHash);
  assert.equal(await fs.readFile(metadataStore.objectPath(context.workspacePath,
    state.base.rootHash), 'utf8').then((text) => JSON.parse(text).files.length), 1);
  await fs.unlink(metadataStore.objectPath(context.workspacePath, state.closure.closureHash));
  await eraseCatalogRows(context);
  const preview = await context.fabric.inspectMetadataRepair({ workspaceId: 'ws-metadata' });
  assert.equal(preview.protocol, 'gqwf-metadata-repair-v1');
  assert.equal(preview.issueCount, 4);
  await assert.rejects(context.fabric.repairMetadata({ workspaceId: 'ws-metadata',
    expectedPlanHash: '0'.repeat(64) }), /plan changed/);
  const receipt = await context.fabric.repairMetadata({ workspaceId: 'ws-metadata',
    expectedPlanHash: preview.planHash });
  assert.equal(receipt.repairedCount, 4);
  assert.equal((await context.fabric.getHead({ workspaceId: 'ws-metadata',
    name: 'main' })).rootHash, state.base.rootHash);
  const root = await context.db.get(`SELECT manifest_json FROM gqwf_roots
    WHERE workspace_id = ? AND root_hash = ?`, 'ws-metadata', state.base.rootHash);
  assert.equal(JSON.parse(root.manifest_json).files[0].path, 'source.txt');
  const lease = await context.db.get('SELECT status FROM gqwf_leases WHERE id = ?',
    state.lease.leaseId);
  assert.equal(lease.status, 'released');
  const closure = await context.fabric.inspectExecutionClosure({
    workspaceId: 'ws-metadata', closureHash: state.closure.closureHash
  });
  assert.equal(closure.registered, true);
  assert.equal(closure.manifest.rootHash, state.base.rootHash);
  assert.equal((await context.fabric.inspectMetadataRepair({
    workspaceId: 'ws-metadata' })).issueCount, 0);
}

async function exerciseAuthorization(context) {
  await seeded(context);
  await eraseCatalogRows(context);
  const preview = await context.fabric.inspectMetadataRepair({ workspaceId: 'ws-metadata' });
  const untrusted = createFabric(context.db);
  await assert.rejects(untrusted.repairMetadata({ workspaceId: 'ws-metadata',
    expectedPlanHash: preview.planHash }), /authorizer is unavailable/);
}

async function exerciseActiveLeaseQuarantine(context) {
  const state = await seeded(context, false);
  await eraseCatalogRows(context);
  const preview = await context.fabric.inspectMetadataRepair({ workspaceId: 'ws-metadata' });
  await context.fabric.repairMetadata({ workspaceId: 'ws-metadata',
    expectedPlanHash: preview.planHash });
  const lease = await context.db.get('SELECT status FROM gqwf_leases WHERE id = ?',
    state.lease.leaseId);
  assert.equal(lease.status, 'quarantined');
}

async function exerciseTamper(context) {
  await seeded(context);
  const latest = await catalog.latestCatalog(context.db, 'ws-metadata');
  await fs.writeFile(metadataStore.objectPath(context.workspacePath,
    latest.ref.catalogHash), '{}');
  await assert.rejects(context.fabric.inspectMetadataRepair({
    workspaceId: 'ws-metadata' }), /integrity check failed/);
}

async function exerciseLegacyCatalog(context) {
  const legacy = { protocol: 'gqwf-catalog-v1', workspaceId: 'ws-metadata',
    revision: 1, previousCatalogHash: null, roots: [], heads: [], leases: [] };
  const catalogHash = await metadataStore.putObject(context.workspacePath,
    JSON.stringify(legacy));
  await metadataStore.writeRef(context.workspacePath, {
    protocol: 'gqwf-catalog-ref-v1', workspaceId: 'ws-metadata',
    revision: 1, catalogHash
  });
  const loaded = await catalog.latestCatalog(context.db, 'ws-metadata');
  assert.equal(loaded.catalog.protocol, 'gqwf-catalog-v1');
  const maintained = await context.fabric.maintainMetadataCatalog({
    workspaceId: 'ws-metadata'
  });
  assert.equal(maintained.catalogHash, catalogHash);
}

async function exerciseCorruptClosureObject(context) {
  const state = await seeded(context);
  await fs.writeFile(metadataStore.objectPath(context.workspacePath,
    state.closure.closureHash), '{}');
  const preview = await context.fabric.inspectMetadataRepair({ workspaceId: 'ws-metadata' });
  assert.deepEqual(preview.issues, [{ type: 'invalid_execution_closure_object',
    entityId: state.closure.closureHash }]);
  await assert.rejects(context.fabric.repairMetadata({ workspaceId: 'ws-metadata',
    expectedPlanHash: preview.planHash }), /collision or corruption/);
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
  await run(exerciseLegacyCatalog);
  await run(exerciseRecovery);
  await run(exerciseCorruptClosureObject);
  await run(exerciseAuthorization);
  await run(exerciseActiveLeaseQuarantine);
  await run(exerciseTamper);
  console.log('GQWF content-addressed metadata recovery: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
