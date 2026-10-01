import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const profile = require('../integrations/codex/development-profile.json');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-development-test-'));
const database = path.join(temporary, 'test.db');
const client = new Client({ name: 'codex-development-test', version: '1' });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'mcp/index.js')],
  cwd: root, stderr: 'pipe', env: { ...process.env, GENOS_MCP_LEASE: profile.tools.join(','),
    GENOS_DB_PATH: database, GENOS_DB_BACKUP_SKIP: '1', GENOS_DB_BOOTSTRAP_SKIP: '0', NODE_ENV: 'test' } });
transport.stderr.on('data', () => {});

function output(result) {
  assert.notEqual(result.isError, true, result.content?.[0]?.text);
  return JSON.parse(result.content[0].text);
}

try {
  await client.connect(transport);
  const list = await client.listTools();
  assert.deepEqual(new Set(list.tools.map((tool) => tool.name)), new Set(profile.tools));
  const denied = await client.callTool({ name: 'genos_merge', arguments: { branch_id: 'HEAD' } });
  assert.equal(denied.isError, true);
  const diagnosis = output(await client.callTool({ name: 'genos_diagnose', arguments: {
    task: 'test failure', hypotheses: [{ id: 'h1', statement: 'Invalid input causes failure', confidence: 0.5 }] } }));
  assert.equal(diagnosis.hypothesisCount, 1);
  const invalid = await client.callTool({ name: 'genos_diagnose', arguments: { task: 'test failure' } });
  assert.equal(invalid.isError, true);
  const analyzed = output(await client.callTool({ name: 'genos_analyze_trajectory', arguments: { actionHistory: ['inspect', 'inspect'] } }));
  assert.equal(analyzed.loopDetected, true);
  const decision = output(await client.callTool({ name: 'genos_record_decision', arguments: {
    agentId: 'codex-test', title: 'Keep explicit leases', decision: 'Retain denial outside the profile', evidence: ['test:lease-denied'] } }));
  assert.equal(decision.persisted, true);
  assert.equal(decision.promoted, false);
  const empty = await client.callTool({ name: 'genos_record_decision', arguments: {
    agentId: 'codex-test', title: 'Invalid decision', decision: 'No evidence', evidence: [] } });
  assert.equal(empty.isError, true);
  const sqlite = require('../backend/node_modules/sqlite3');
  const db = new sqlite.Database(database, sqlite.OPEN_READONLY);
  const row = await new Promise((resolve, reject) => db.get('SELECT content FROM genome_decisions WHERE id = ?', decision.decisionId,
    (error, result) => error ? reject(error) : resolve(result)));
  assert.equal(JSON.parse(row.content).evidence[0], 'test:lease-denied');
  await new Promise((resolve) => db.close(resolve));
  console.log('Real MCP discovery, lease denial, diagnosis, trajectory analysis and SQLite decision persistence verified.');
} finally {
  await client.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
