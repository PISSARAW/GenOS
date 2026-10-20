'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { createFabric, migrateGqwf } = require('../src/services/gqwf');
const metadataStore = require('../src/services/gqwf/metadataStore');

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function fixture() {
  const parent = path.resolve(__dirname, '../../.genos-agent-worlds/gqwf-closure-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'closure-'));
  const workspacePath = path.join(root, 'workspace');
  await fs.mkdir(workspacePath);
  await fs.writeFile(path.join(workspacePath, 'package-lock.json'), '{"lockfileVersion":3}');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT NOT NULL,
      organization_id TEXT, project_id TEXT);`);
  await db.run('INSERT INTO workspaces VALUES (?, ?, ?, ?)',
    'ws-closure', workspacePath, 'organization-a', 'project-a');
  await migrateGqwf(db);
  const fabric = createFabric(db);
  const base = await fabric.importBase({ workspaceId: 'ws-closure' });
  return { db, fabric, parent, root, workspacePath, base };
}

function descriptor(base) {
  return {
    workspaceId: 'ws-closure',
    rootHash: base.rootHash,
    command: { executable: 'node', arguments: ['tests/run.js', '--ci'] },
    runtime: { name: 'node', version: '24.18.0', digest: hash('node-runtime') },
    dependencies: [
      { name: 'sqlite', version: '5.1.7', digest: hash('sqlite-5.1.7') },
      { name: 'express', version: '5.1.0', digest: hash('express-5.1.0') }
    ],
    environment: [
      { name: 'CI', valueHash: hash('true') },
      { name: 'NODE_ENV', valueHash: hash('test') }
    ]
  };
}

async function exerciseCanonicalClosure(context) {
  const input = descriptor(context.base);
  const first = await context.fabric.sealExecutionClosure(input);
  const reordered = { ...input,
    dependencies: [...input.dependencies].reverse(),
    environment: [...input.environment].reverse() };
  const second = await context.fabric.sealExecutionClosure(reordered);
  assert.equal(first.protocol, 'gqwf-execution-closure-v1');
  assert.equal(first.closureHash, second.closureHash);
  assert.deepEqual(first.assurance, { fileRoot: 'content-addressed',
    externalInputs: 'declared-only', sandbox: 'not-attested' });
  const rows = await context.db.all('SELECT * FROM gqwf_execution_closures');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].closure_hash, first.closureHash);
  assert.equal(rows[0].manifest_json.includes('super-secret-value'), false);
  const inspected = await context.fabric.inspectExecutionClosure({
    workspaceId: 'ws-closure', closureHash: first.closureHash
  });
  assert.equal(inspected.registered, true);
  assert.equal(inspected.manifest.rootHash, context.base.rootHash);
  assert.deepEqual(inspected.manifest.dependencies.map((entry) => entry.name),
    ['express', 'sqlite']);
  const garbage = await context.fabric.inspectGarbage({ workspaceId: 'ws-closure' });
  assert.equal(garbage.orphanRoots.includes(context.base.rootHash), false);
  const scrub = await context.fabric.scrubIntegrity({ workspaceId: 'ws-closure' });
  assert.equal(scrub.status, 'healthy');
  assert.equal(scrub.verifiedExecutionClosureCount, 1);
  return first;
}

async function exerciseIndexLoss(context, sealed) {
  await context.db.run('DELETE FROM gqwf_execution_closures WHERE workspace_id = ?',
    'ws-closure');
  const inspected = await context.fabric.inspectExecutionClosure({
    workspaceId: 'ws-closure', closureHash: sealed.closureHash
  });
  assert.equal(inspected.registered, false);
  assert.equal(inspected.manifest.command.executable, 'node');
}

async function exerciseRefusals(context) {
  const input = descriptor(context.base);
  await assert.rejects(context.fabric.sealExecutionClosure({ ...input,
    undeclaredInput: 'must-not-be-ignored'
  }), /unsupported fields/);
  await assert.rejects(context.fabric.sealExecutionClosure({ ...input,
    environment: [{ name: 'TOKEN', valueHash: hash('secret'), value: 'secret' }]
  }), /unsupported fields/);
  await assert.rejects(context.fabric.sealExecutionClosure({ ...input,
    environment: [input.environment[0], input.environment[0]]
  }), /duplicate environment/);
  await assert.rejects(context.fabric.sealExecutionClosure({ ...input,
    dependencies: [{ ...input.dependencies[0], digest: 'not-a-hash' }]
  }), /SHA-256/);
  await assert.rejects(context.fabric.sealExecutionClosure({ ...input,
    rootHash: 'f'.repeat(64)
  }), /not reachable/);
}

async function exerciseTampering(context) {
  const sealed = await context.fabric.sealExecutionClosure(descriptor(context.base));
  const objectPath = metadataStore.objectPath(context.workspacePath, sealed.closureHash);
  await fs.writeFile(objectPath, '{}');
  await assert.rejects(context.fabric.inspectExecutionClosure({
    workspaceId: 'ws-closure', closureHash: sealed.closureHash
  }), /integrity check failed/);
  const scrub = await context.fabric.scrubIntegrity({ workspaceId: 'ws-closure' });
  assert.equal(scrub.status, 'corrupt');
  assert.deepEqual(scrub.issues, [{ type: 'invalid_execution_closure',
    closureHash: sealed.closureHash }]);
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
  await run(async (context) => {
    const sealed = await exerciseCanonicalClosure(context);
    await exerciseIndexLoss(context, sealed);
    await exerciseRefusals(context);
  });
  await run(exerciseTampering);
  console.log('GQWF content-addressed execution closure: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
