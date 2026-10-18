import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import stateStore from '../integrations/codex/session-state.cjs';

const require = createRequire(import.meta.url);
const sqlite3 = require('../backend/node_modules/sqlite3');
const root = path.resolve(import.meta.dirname, '..');
const profile = require('../integrations/codex/development-profile.json');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-development-test-'));
const database = path.join(temporary, 'test.db');
const client = new Client({ name: 'codex-development-test', version: '1' });
let childProcess = null;
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'mcp/index.js')],
  cwd: root, stderr: 'pipe', env: { ...process.env, GENOS_MCP_LEASE: profile.tools.join(','),
    GENOS_AGENT_ID: 'codex-test', GENOS_DB_PATH: database, GENOS_DB_BACKUP_SKIP: '1',
    GENOS_DB_BOOTSTRAP_SKIP: '0', NODE_ENV: 'test' } });
transport.stderr.on('data', () => {});

function output(result) {
  assert.notEqual(result.isError, true, result.content?.[0]?.text);
  return JSON.parse(result.content[0].text);
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params,
    (error) => error ? reject(error) : resolve()));
}

async function waitForChildClose(child) {
  if (!child || child.exitCode !== null) return;
  await Promise.race([new Promise((resolve) => child.once('close', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000))]);
  assert.notEqual(child.exitCode, null, 'MCP stdio child must stop before fixture cleanup.');
}

async function removeTemporary(directory) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  fs.rmSync(directory, { recursive: true, force: true });
}

try {
  await client.connect(transport);
  childProcess = transport._process;
  const list = await client.listTools();
  assert.deepEqual(new Set(list.tools.map((tool) => tool.name)), new Set(profile.tools));
  const failureSchema = list.tools.find((tool) => tool.name === 'genos_search_failures').inputSchema;
  assert.deepEqual(Object.keys(failureSchema.properties).sort(),
    Object.keys(require('./toolDefinitions.json').tools.find((tool) => tool.name === 'genos_search_failures').inputSchema.properties).sort());
  assert.equal(failureSchema.properties.limit.minimum, 1);
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
  const experience = await client.callTool({ name: 'genos_record_experience', arguments: {
    agentId: 'codex-test', actionInput: 'Run lease and persistence probes', observationOutput: 'Executable integration probes passed', rewardScore: 1 } });
  assert.ok(stateStore.successfulMcp(experience), `The real experience response must satisfy the session gate: ${JSON.stringify(experience)}`);
  const failure = `lease-failure-${Date.now()}`;
  const compiled = output(await client.callTool({ name: 'genos_compile_memory', arguments: {
    agentId: 'codex-test', facts: ['explicit leases are required'], failures: [failure], source_refs: ['test:development'] } }));
  assert.equal(compiled.compiledCount, 2);
  assert.equal(compiled.memoryIds.length, 2);
  const searched = output(await client.callTool({ name: 'genos_search_failures', arguments: { query: failure } }));
  assert.ok(searched.failures.some((item) => JSON.stringify(item).includes(failure)));
  const db = new sqlite3.Database(database, sqlite3.OPEN_READWRITE);
  await run(db, "INSERT INTO organizations (id, name) VALUES ('codex-test-org', 'Codex Test Org')");
  await run(db, "INSERT INTO projects (id, organization_id, name) VALUES ('codex-test-project', 'codex-test-org', 'Codex Test Project')");
  await run(db, "INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('codex-test-workspace', 'Codex Test Workspace', 'fixture', 'codex-test-org', 'codex-test-project')");
  await run(db, "INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES ('codex-test', 'Codex Test', 'tester', 'idle', 'orchestrator', 'codex-test-workspace')");
  const provenance = output(await client.callTool({ name: 'genos_blame', arguments: { target_id: 'codex-test' } }));
  assert.ok(provenance.evidence.length > 0);
  const row = await new Promise((resolve, reject) => db.get('SELECT content FROM genome_decisions WHERE id = ?', decision.decisionId,
    (error, result) => error ? reject(error) : resolve(result)));
  assert.equal(JSON.parse(row.content).evidence[0], 'test:lease-denied');
  await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
  console.log('Seven development MCP tools verified through stdio, memory persistence, search and provenance.');
} finally {
  await client.close();
  await waitForChildClose(childProcess);
  await removeTemporary(temporary);
}
