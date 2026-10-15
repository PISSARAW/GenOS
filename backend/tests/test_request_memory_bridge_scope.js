'use strict';

const assert = require('assert');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const bridge = require('../bin/requestMemoryBridge.cjs');

async function memoryDb() {
  const sqlite3 = require('sqlite3').verbose();
  const { open } = require('sqlite');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec('CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT NOT NULL)');
  return db;
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-request-scope-'));
  const firstRoot = path.join(tempRoot, 'first');
  const secondRoot = path.join(tempRoot, 'second');
  await Promise.all([fs.mkdir(firstRoot), fs.mkdir(secondRoot)]);
  const db = await memoryDb();
  try {
    await db.run('INSERT INTO workspaces (id, path) VALUES (?, ?), (?, ?)',
      'request-scope-a', firstRoot, 'request-scope-b', secondRoot);
    const task = 'Can a client call an MCP tool excluded by GENOS_MCP_DISABLED_TOOLS?';
    const first = await bridge.checkReuse(db, { workspaceRoot: firstRoot }, task);
    assert.equal(first.scopeId, 'workspace:request-scope-a');
    assert.equal(first.lookup.hit, false);
    await bridge.storeMissionResult(db, { ...first, request: { workspaceRoot: firstRoot },
      summary: { verdict: 'first' } });

    const second = await bridge.checkReuse(db, { workspaceRoot: secondRoot }, task);
    assert.equal(second.scopeId, 'workspace:request-scope-b');
    assert.equal(second.lookup.hit, false);
    await bridge.storeMissionResult(db, { ...second, request: { workspaceRoot: secondRoot },
      summary: { verdict: 'second' } });

    const rows = await db.all('SELECT normalized_intent FROM request_problems ORDER BY semantic_id');
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.normalized_intent.includes('mcp tool excluded')));
    await assert.rejects(() => bridge.checkReuse(db, {}, task),
      (error) => error.code === 'RESULT_SCOPE_REQUIRED');
  } finally {
    await db.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
  console.log('request-memory bridge scope: all assertions passed');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
