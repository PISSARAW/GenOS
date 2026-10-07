import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sqlite3 = require('../backend/node_modules/sqlite3');
const root = path.resolve(import.meta.dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-orchestrator-entry-'));
const database = path.join(temporary, 'entry.db');
const bridge = path.join(root, 'backend/bin/genos-orchestrate.cjs');
const env = { ...process.env, GENOS_DB_PATH: database, GENOS_DB_BACKUP_SKIP: '1',
  GENOS_ADMIN_PASSWORD: 'mcp-orchestrator-entry-test-password', GENOS_STREAM_TELEMETRY: '0' };

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(database, sqlite3.OPEN_READONLY);
    db.get(sql, params, (error, row) => db.close(() => error ? reject(error) : resolve(row)));
  });
}

try {
  const text = execFileSync(process.execPath, [bridge, JSON.stringify({ action: 'report_progress',
    orchestratorId: 'entry-test-root', message: 'Bridge is running', progress_percent: 25 })],
  { cwd: root, env, encoding: 'utf8' });
  const progress = JSON.parse(text);
  assert.equal(progress.reported, true);
  assert.equal(progress.event.detail, 'Bridge is running');
  const parent = await get('SELECT execution_mode FROM agents WHERE id = ?', ['entry-test-root']);
  assert.equal(parent.execution_mode, 'orchestrator');

  const invalid = spawnSync(process.execPath, [bridge, JSON.stringify({ action: 'change_organization',
    orchestratorId: 'entry-test-root', organization: 'nonexistent_topology' })],
  { cwd: root, env, encoding: 'utf8' });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /Unknown GenOS organization/);
  const after = await get('SELECT status FROM agents WHERE id = ?', ['entry-test-root']);
  assert.notEqual(after.status, 'error', 'invalid read/control action must not poison the parent mission');
  console.log('Orchestrator bridge runs, persists its parent, and fails closed on invalid control actions.');
} finally {
  assert.ok(path.resolve(temporary).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  fs.rmSync(temporary, { recursive: true, force: true });
}
