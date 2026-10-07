import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-mcp-identity-'));
const database = path.join(temporary, 'identity.db');
process.env.GENOS_ADMIN_PASSWORD ||= 'mcp-worker-identity-test-password';
const { getDatabase, closeDatabase } = require('../backend/src/db');
const client = new Client({ name: 'worker-identity-test', version: '1' });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'mcp/index.js')],
  cwd: root, stderr: 'pipe', env: { ...process.env, GENOS_DB_PATH: database,
    GENOS_REPO_ROOT: root, GENOS_ORCHESTRATOR_BRIDGE: path.join(root, 'backend/bin/genos-orchestrate.cjs'),
    GENOS_AGENT_ID: '', GENOS_DB_BACKUP_SKIP: '1', NODE_ENV: 'test',
    GENOS_MCP_LEASE: 'genos_worker_publish,genos_worker_inbox,genos_organization_state' } });
transport.stderr.on('data', () => {});

try {
  const db = await getDatabase(database);
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode) VALUES ('identity-root','Root','orchestrator','running','orchestrator')");
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode,parent_agent_id) VALUES ('identity-worker','Worker','implementation','running','worker','identity-root')");
  await closeDatabase();
  await client.connect(transport);

  for (const [name, args] of [
    ['genos_worker_inbox', { orchestrator_id: 'identity-root', requesterAgentId: 'identity-worker' }],
    ['genos_organization_state', { orchestrator_id: 'identity-root', requesterAgentId: 'identity-worker' }],
    ['genos_worker_publish', { orchestrator_id: 'identity-root', senderAgentId: 'identity-worker',
      kind: 'evidence', signal_type: 'ligand', signal_data: { event: 'spoof' } }]
  ]) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, true, `${name} must reject an unbound actor`);
    assert.match(result.content[0].text, /GENOS_AGENT_ID is required/);
  }
  const check = await getDatabase(database);
  const state = await check.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agent_organization_messages'");
  if (state) {
    const messages = await check.get('SELECT COUNT(*) AS count FROM agent_organization_messages');
    assert.equal(messages.count, 0);
  }
  console.log('Worker communication denies forged arguments without a bound runtime identity.');
} finally {
  await client.close();
  await closeDatabase();
  assert.ok(path.resolve(temporary).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  fs.rmSync(temporary, { recursive: true, force: true });
}
