import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-worker-replay-'));
const workspace = path.join(temporary, 'workspace');
const database = path.join(temporary, 'replay.db');
const snapshotDirectory = path.join(workspace, '.genos', 'evidence-snapshots');
fs.mkdirSync(snapshotDirectory, { recursive: true });
fs.writeFileSync(path.join(snapshotDirectory, 'worker-run.json'), JSON.stringify({
  snapshot_id: 'snap-worker-a', agent_id: 'worker-a'
}));
process.env.GENOS_ADMIN_PASSWORD ||= 'mcp-worker-replay-test-password';
const { getDatabase, closeDatabase } = require('../backend/src/db');
const client = new Client({ name: 'worker-replay-scope-test', version: '1' });
const transport = new StdioClientTransport({
  command: process.execPath, args: [path.join(root, 'mcp/index.js')], cwd: root, stderr: 'pipe',
  env: { ...process.env, GENOS_DB_PATH: database, GENOS_REPO_ROOT: root,
    GENOS_AGENT_ID: 'worker-a', GENOS_DB_BACKUP_SKIP: '1', NODE_ENV: 'test',
    GENOS_MCP_LEASE: 'genos_replay' }
});
transport.stderr.on('data', () => {});

try {
  const db = await getDatabase(database);
  await db.run("INSERT INTO workspaces (id, name, path, description) VALUES ('replay-ws', 'Replay WS', ?, 'replay test')", workspace);
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES ('worker-a', 'Worker A', 'implementation', 'running', 'worker', 'replay-ws')");
  await closeDatabase();
  await client.connect(transport);
  const result = await client.callTool({ name: 'genos_replay', arguments: { snapshot: 'snap-worker-b' } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /only their own evidence capsule/);
  console.log('MCP replay denies another worker\'s capsule: PASS');
} finally {
  await client.close();
  await closeDatabase();
  assert.ok(path.resolve(temporary).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  fs.rmSync(temporary, { recursive: true, force: true });
}
