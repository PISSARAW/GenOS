import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-mcp-strategy-'));
const database = path.join(temporary, 'strategy.db');
process.env.GENOS_ADMIN_PASSWORD ||= 'mcp-strategy-selection-test-password';
const { getDatabase, closeDatabase } = require('../backend/src/db');
const contracts = require('../backend/src/services/strategyContractService');
const client = new Client({ name: 'strategy-selection-test', version: '1' });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'mcp/index.js')],
  cwd: root, stderr: 'pipe', env: { ...process.env, GENOS_DB_PATH: database,
    GENOS_REPO_ROOT: root, GENOS_ORCHESTRATOR_BRIDGE: path.join(root, 'backend/bin/genos-orchestrate.cjs'),
    GENOS_AGENT_ID: 'strategy-root', GENOS_DB_BACKUP_SKIP: '1', NODE_ENV: 'test',
    GENOS_MCP_LEASE: 'genos_change_strategy' } });
transport.stderr.on('data', () => {});

try {
  const db = await getDatabase(database);
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode) VALUES ('strategy-root','Root','orchestrator','running','orchestrator')");
  const initial = await contracts.saveContract(db, { agentId: 'strategy-root', problem: 'Implement a small API endpoint.' });
  assert.notEqual(initial.primaryStrategy, 'deterministic_direct_path');
  await closeDatabase();
  await client.connect(transport);
  const target = { orchestrator_id: 'strategy-root', need: 'Implement a small API endpoint.',
    strategy: 'deterministic_direct_path', reason: 'Direct deterministic checks are sufficient.' };
  const changedResult = await client.callTool({ name: 'genos_change_strategy', arguments: target });
  assert.notEqual(changedResult.isError, true, changedResult.content?.[0]?.text);
  const changed = JSON.parse(changedResult.content[0].text);
  assert.equal(changed.changed, true);
  assert.equal(changed.current.primary, 'deterministic_direct_path');
  assert.equal(changed.current.version, 2);
  const observed = await getDatabase(database);
  const persisted = await contracts.getLatestContract(observed, 'strategy-root');
  assert.equal(persisted.primaryStrategy, 'deterministic_direct_path');
  const run = await observed.get('SELECT status FROM strategy_execution_runs WHERE id = ?', changed.executionRun.runId);
  assert.equal(run.status, 'planned');
  await closeDatabase();
  const unknown = await client.callTool({ name: 'genos_change_strategy', arguments: {
    ...target, strategy: 'unknown_strategy' } });
  assert.equal(unknown.isError, true);
  assert.match(unknown.content[0].text, /Unknown requested strategy/);
  console.log('Requested strategy is selected, persisted, and unknown IDs fail through MCP stdio.');
} finally {
  await client.close();
  await closeDatabase();
  assert.ok(path.resolve(temporary).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  fs.rmSync(temporary, { recursive: true, force: true });
}
