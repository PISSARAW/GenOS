import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-mcp-organization-'));
const database = path.join(temporary, 'organization.db');
process.env.GENOS_ADMIN_PASSWORD ||= 'mcp-organization-transition-test-password';
const { getDatabase, closeDatabase } = require('../backend/src/db');
const client = new Client({ name: 'organization-transition-test', version: '1' });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'mcp/index.js')],
  cwd: root, stderr: 'pipe', env: { ...process.env, GENOS_DB_PATH: database,
    GENOS_REPO_ROOT: root, GENOS_ORCHESTRATOR_BRIDGE: path.join(root, 'backend/bin/genos-orchestrate.cjs'),
    GENOS_AGENT_ID: 'organization-root', GENOS_DB_BACKUP_SKIP: '1', NODE_ENV: 'test',
    GENOS_MCP_LEASE: 'genos_change_organization,genos_organization_state' } });
transport.stderr.on('data', () => {});

function output(result) {
  assert.notEqual(result.isError, true, result.content?.[0]?.text);
  return JSON.parse(result.content[0].text);
}

try {
  const db = await getDatabase(database);
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode) VALUES ('organization-root','Root','orchestrator','running','orchestrator')");
  await closeDatabase();
  await client.connect(transport);
  const identity = { orchestrator_id: 'organization-root' };
  for (const [organization, version] of [
    ['specialist_expert_committee', 1], ['red_blue_coevolution', 2]
  ]) {
    const changed = output(await client.callTool({ name: 'genos_change_organization', arguments: {
      ...identity, organization, reason: 'MCP transition proof' } }));
    assert.equal(changed.changed, true);
    assert.equal(changed.version, version);
    const state = output(await client.callTool({ name: 'genos_organization_state', arguments: identity }));
    assert.equal(state.organization, organization);
    assert.equal(state.version, version);
  }
  const observed = await getDatabase(database);
  const rows = await observed.all('SELECT to_organization, version FROM agent_organization_transitions WHERE orchestrator_id = ? ORDER BY version',
    'organization-root');
  assert.deepEqual(rows.map(({ to_organization, version }) => [to_organization, version]),
    [['specialist_expert_committee', 1], ['red_blue_coevolution', 2]]);
  console.log('Organization transitions and state are persisted and read through MCP stdio.');
} finally {
  await client.close();
  await closeDatabase();
  assert.ok(path.resolve(temporary).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  fs.rmSync(temporary, { recursive: true, force: true });
}
