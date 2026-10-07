import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(import.meta.dirname, '..');
const executable = path.join(root, 'target/debug', process.platform === 'win32' ? 'genos.exe' : 'genos');
assert.ok(fs.existsSync(executable), 'Build genos-cli before running the native MCP test.');
const temporary = fs.mkdtempSync(path.join(root, '.genos-mcp-native-'));
const outputPath = path.join(temporary, 'snapshot.json');
const relativeOutput = path.relative(root, outputPath).replaceAll('\\', '/');
const client = new Client({ name: 'genos-native-snapshot-test', version: '1' });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'mcp/index.js')],
  cwd: root, stderr: 'pipe', env: { ...process.env, GENOS_MCP_LEASE: 'genos_snapshot,genos_replay',
    GENOS_BIN: executable, GENOS_DB_PATH: path.join(temporary, 'test.db'), NODE_ENV: 'test' } });
transport.stderr.on('data', () => {});

try {
  await client.connect(transport);
  const snapshot = await client.callTool({ name: 'genos_snapshot', arguments: {
    agent: 'agents/securite/snapshot_integrity_guardian.agent.json', out: relativeOutput } });
  assert.notEqual(snapshot.isError, true, snapshot.content?.[0]?.text);
  assert.ok(fs.existsSync(outputPath), 'native snapshot must write the output file');
  assert.ok(Object.keys(JSON.parse(fs.readFileSync(outputPath, 'utf8'))).length > 0);
  const replay = await client.callTool({ name: 'genos_replay', arguments: { snapshot: relativeOutput } });
  assert.notEqual(replay.isError, true, replay.content?.[0]?.text);
  const proof = JSON.parse(replay.content[0].text);
  assert.equal(proof.replay_status, 'VERIFIED');
  assert.equal(proof.execution_replayed, true);
  assert.ok(proof.final_chain_hash);
  console.log('Native snapshot and replay completed through real MCP stdio.');
} finally {
  await client.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
