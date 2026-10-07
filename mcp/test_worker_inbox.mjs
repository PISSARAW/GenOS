import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-mcp-inbox-'));
const database = path.join(temporary, 'inbox.db');
process.env.GENOS_ADMIN_PASSWORD ||= 'mcp-worker-inbox-test-password';
const { getDatabase, closeDatabase } = require('../backend/src/db');
const organization = require('../backend/src/services/dynamicOrganizationService');
const client = new Client({ name: 'worker-inbox-test', version: '1' });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'mcp/index.js')],
  cwd: root, stderr: 'pipe', env: { ...process.env, GENOS_DB_PATH: database,
    GENOS_REPO_ROOT: root, GENOS_ORCHESTRATOR_BRIDGE: path.join(root, 'backend/bin/genos-orchestrate.cjs'),
    GENOS_DB_BACKUP_SKIP: '1', GENOS_AGENT_ID: 'inbox-worker', GENOS_EXECUTION_MODE: 'worker',
    GENOS_MCP_LEASE: 'genos_worker_inbox,genos_organization_state', NODE_ENV: 'test' } });
let stderr = '';
transport.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

function output(result) {
  assert.notEqual(result.isError, true, result.content?.[0]?.text);
  assert.ok(result.content?.[0]?.text?.trim(), `Empty MCP result: ${JSON.stringify(result)}; stderr: ${stderr}`);
  return JSON.parse(result.content[0].text);
}

try {
  const db = await getDatabase(database);
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode) VALUES ('inbox-root','Root','orchestrator','running','orchestrator')");
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode,parent_agent_id) VALUES ('inbox-worker','Worker','implementation','running','worker','inbox-root')");
  await organization.changeOrganization(db, { orchestratorId: 'inbox-root',
    organization: 'red_blue_coevolution', changedBy: 'inbox-root' });
  const published = await organization.publish(db, { orchestratorId: 'inbox-root',
    senderAgentId: 'inbox-root', recipientAgentId: 'inbox-worker', kind: 'evidence',
    signalType: 'ligand', signalData: { event: 'mcp_inbox_verified' } });
  await closeDatabase();

  await client.connect(transport);
  const arguments_ = { orchestrator_id: 'inbox-root' };
  const inbox = output(await client.callTool({ name: 'genos_worker_inbox', arguments: arguments_ }));
  assert.equal(inbox.state.organization, 'red_blue_coevolution');
  assert.equal(inbox.messages.length, 1);
  assert.equal(inbox.messages[0].id, published.id);
  assert.equal(inbox.messages[0].signal.event, 'mcp_inbox_verified');
  assert.equal(inbox.messages[0].integrity.status, 'verified');
  const after = output(await client.callTool({ name: 'genos_worker_inbox',
    arguments: { ...arguments_, after_id: published.id } }));
  assert.equal(after.messages.length, 0);
  const wrongParent = await client.callTool({ name: 'genos_worker_inbox',
    arguments: { orchestrator_id: 'nonexistent-root' } });
  assert.equal(wrongParent.isError, true, 'a wrong public parent ID must not fall back to a different active orchestrator');
  const state = output(await client.callTool({ name: 'genos_organization_state', arguments: arguments_ }));
  assert.equal(state.organization, 'red_blue_coevolution');
  assert.equal(state.messages, undefined);
  console.log('Worker inbox returns persisted, integrity-checked messages through MCP stdio.');
} finally {
  await client.close();
  await closeDatabase();
  assert.ok(path.resolve(temporary).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  fs.rmSync(temporary, { recursive: true, force: true });
}
