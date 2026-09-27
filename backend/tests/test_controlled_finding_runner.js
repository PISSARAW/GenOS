'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const snapshots = require('../src/services/workspaceSnapshotStore');
const { migrateDaemonFindings } = require('../src/db/migrations/migrateDaemonFindings');
const { runControlledFinding } = require('../src/services/daemon/verification/controlledFindingRunnerService');
const gate = require('../src/services/daemon/findings/findingEvidenceGateService');

async function createSchema(db, root) {
  await db.exec(`
    CREATE TABLE workspaces(id TEXT PRIMARY KEY, path TEXT);
    CREATE TABLE workspace_snapshots(id TEXT PRIMARY KEY, workspace_id TEXT,
      snapshot_hash TEXT, step_number INTEGER, label TEXT, author TEXT,
      reason TEXT, diff_summary TEXT, metadata TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE daemon_territories(id TEXT PRIMARY KEY, workspace_id TEXT);
    CREATE TABLE provenance_records(id TEXT PRIMARY KEY, subject_type TEXT,
      subject_id TEXT, payload_hash TEXT, payload_json TEXT);
  `);
  await db.run('INSERT INTO workspaces VALUES (?, ?)', 'workspace.test', root);
  await db.run('INSERT INTO daemon_territories VALUES (?, ?)', 'territory.test', 'workspace.test');
  await migrateDaemonFindings(db);
  await db.run(`INSERT INTO daemon_findings
    (id, territory_id, claim, scope_type, scope_value, head_sha, status,
     created_by, limitations_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  'finding.test', 'territory.test', 'A reproducible failing test is repaired', 'test',
  'npm test', 'a'.repeat(40), 'REPRODUCED', 'daemon.test', '["test fixture"]');
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-daemon-causal-'));
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await createSchema(db, root);
    const workspace = { id: 'workspace.test', path: root };
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
      scripts: { test: 'node check.js' }
    }));
    await fs.writeFile(path.join(root, 'check.js'), 'process.exit(1)');
    const baseline = await snapshots.capture({ db, workspace });
    await fs.writeFile(path.join(root, 'check.js'), 'process.exit(0)');
    const intervention = await snapshots.capture({ db, workspace });
    const result = await runControlledFinding(db, { findingId: 'finding.test',
      baselineSnapshotId: baseline.id, interventionSnapshotId: intervention.id, command: 'npm test' });
    assert.equal(result.supported, true);
    assert.equal(result.runs.length, 2);
    assert.equal(await gate.transitionError(db, { id: 'finding.test', toStatus: 'CAUSALLY_SUPPORTED' }), null);
    console.log('Controlled daemon finding runner: PASS');
  } finally {
    await db.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
