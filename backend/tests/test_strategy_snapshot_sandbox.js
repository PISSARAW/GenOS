const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'snapshot-sandbox-test';

const { getDatabase, closeDatabase } = require('../src/db');
const { snapshot } = require('../src/services/primitiveHandlers/fundamentals');

async function run() {
  const dbPath = path.resolve(__dirname, 'strategy-snapshot-sandbox.db');
  for (const suffix of ['', '-shm', '-wal']) {
    if (fs.existsSync(`${dbPath}${suffix}`)) fs.unlinkSync(`${dbPath}${suffix}`);
  }
  const db = await getDatabase(dbPath);
  try {
    // Regression premise: a pre-existing sandbox row with the old constant name
    // and a NULL tenant used to collide on idx_workspaces_tenant_name, so every
    // later agent sandbox INSERT was silently ignored and the lookup failed.
    await db.run(
      'INSERT INTO workspaces (id, name, path, visibility, language) VALUES (?, ?, ?, ?, ?)',
      'ws-sandbox-existing', 'Agent Sandbox Workspace', path.join(os.tmpdir(), 'genos-ws-existing'), 'Private', 'TypeScript'
    );
    await db.run(
      "INSERT OR REPLACE INTO agents (id, name, role, status, execution_mode) VALUES ('sandbox-agent', 'Sandbox Agent', 'worker', 'running', 'worker')"
    );

    const result = await snapshot({ agentId: 'sandbox-agent' });
    assert.equal(result.success, true, result.error);
    assert.ok(result.snapshotId, 'snapshot must return an id');

    const row = await db.get('SELECT id, name FROM workspaces WHERE id = ?', 'ws-sandbox-sandbox-agent');
    assert.ok(row, 'the per-agent sandbox workspace must be persisted');
    assert.match(row.name, /sandbox-agent/);
    console.log('Snapshot sandbox workspaces stay unique per agent despite a colliding legacy row.');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) {
      const file = `${dbPath}${suffix}`;
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
