'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');

const { getDatabase, closeDatabase } = require('../src/db');

async function testBootstrapInitialState(dbPath) {
  delete process.env.GENOS_DB_BOOTSTRAP_SKIP;
  const db = await getDatabase(dbPath);

  // 1. Referential integrity on initial open
  await assert.rejects(
    () => db.run(
      'INSERT INTO workspace_snapshots (id, workspace_id, snapshot_hash, step_number, label, author) VALUES (?, ?, ?, ?, ?, ?)',
      ['snap-1', 'ws-non-existent', 'hash123', 1, 'Initial', 'author']
    ),
    /FOREIGN KEY constraint failed/i
  );

  // 2. Insert valid parent and child
  await db.run(
    'INSERT INTO workspaces (id, name, path) VALUES (?, ?, ?)',
    ['ws-valid-1', 'Workspace Test', '/tmp/ws-test']
  );
  await db.run(
    'INSERT INTO workspace_snapshots (id, workspace_id, snapshot_hash, step_number, label, author, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['snap-1', 'ws-valid-1', 'hash123', 1, 'Initial', 'author', JSON.stringify({ version: '1.0', items: [42] })]
  );

  await closeDatabase();
}

async function testReopenFidelity(dbPath) {
  process.env.GENOS_DB_BOOTSTRAP_SKIP = '1';
  const reopenedDb = await getDatabase(dbPath);

  // Verify records are preserved and typed accurately
  const row = await reopenedDb.get(
    'SELECT id, workspace_id, snapshot_hash, step_number, label, metadata FROM workspace_snapshots WHERE id = ?',
    'snap-1'
  );
  assert.ok(row, 'Snapshot row must exist after reopening');
  assert.equal(row.id, 'snap-1');
  assert.equal(row.workspace_id, 'ws-valid-1');
  assert.equal(row.step_number, 1);
  assert.equal(JSON.parse(row.metadata).items[0], 42);

  // Verify foreign_keys is still enforced on reopened connection with GENOS_DB_BOOTSTRAP_SKIP=1
  await assert.rejects(
    () => reopenedDb.run(
      'INSERT INTO workspace_snapshots (id, workspace_id, snapshot_hash, step_number, label, author) VALUES (?, ?, ?, ?, ?, ?)',
      ['snap-2', 'ws-still-non-existent', 'hash456', 2, 'Next', 'author']
    ),
    /FOREIGN KEY constraint failed/i
  );

  await closeDatabase();
}

async function main() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-reopen-test-'));
  const dbPath = path.join(tmpDir, 'test_reopen.db');
  process.env.GENOS_TEST_MODE = '1';
  process.env.NODE_ENV = 'test';

  try {
    await testBootstrapInitialState(dbPath);
    await testReopenFidelity(dbPath);
  } finally {
    delete process.env.GENOS_DB_BOOTSTRAP_SKIP;
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

main().catch((err) => {
  console.error('Storage reopen fidelity test failed:', err);
  process.exit(1);
});
