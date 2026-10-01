import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(import.meta.dirname, '..');
const binary = path.join(root, 'target/debug', process.platform === 'win32' ? 'genos.exe' : 'genos');
assert.ok(fs.existsSync(binary), 'Build genos-cli before running the checkpoint integration test.');
const parent = path.join(root, '.genos-agent-worlds');
fs.mkdirSync(parent, { recursive: true });
const workspace = fs.mkdtempSync(path.join(parent, 'codex-checkpoint-test-'));
const relative = path.relative(root, workspace).replaceAll('\\', '/');
const agent = `${relative}/agent.json`;
const snapshot = `${relative}/baseline.json`;
fs.writeFileSync(path.join(root, agent), JSON.stringify({ cell_id: 'codex-checkpoint-test', name: 'Checkpoint integration test', role: 'test' }));
const client = new Client({ name: 'codex-checkpoint-test', version: '1' });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'mcp/index.js')], cwd: root,
  stderr: 'pipe', env: { ...process.env, GENOS_BIN: binary, GENOS_MCP_LEASE: 'genos_snapshot,genos_replay' } });
transport.stderr.on('data', () => {});

try {
  await client.connect(transport);
  const created = await client.callTool({ name: 'genos_snapshot', arguments: { agent, out: snapshot } });
  assert.notEqual(created.isError, true, created.content?.[0]?.text);
  const persisted = JSON.parse(fs.readFileSync(path.join(root, snapshot), 'utf8'));
  assert.equal(persisted.agent_id, 'codex-checkpoint-test');
  assert.ok(persisted.snapshot_id);
  const replayed = await client.callTool({ name: 'genos_replay', arguments: { snapshot } });
  assert.notEqual(replayed.isError, true, replayed.content?.[0]?.text);
  const escaped = await client.callTool({ name: 'genos_snapshot', arguments: { agent, out: '../outside.json' } });
  assert.equal(escaped.isError, true);
  console.log('Real MCP snapshot artifact, replay and path confinement verified.');
} finally {
  await client.close();
  assert.ok(workspace.startsWith(parent + path.sep));
  fs.rmSync(workspace, { recursive: true, force: true });
}
