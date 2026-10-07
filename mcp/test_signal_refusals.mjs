import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(import.meta.dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-signal-mcp-test-'));
const client = new Client({ name: 'signal-refusal-test', version: '1' });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'mcp/index.js')],
  cwd: root, stderr: 'pipe', env: { ...process.env,
    GENOS_MCP_LEASE: 'genos_signal_plasmid_transfer,genos_signal_collective_decision',
    GENOS_DB_PATH: path.join(temporary, 'test.db'), NODE_ENV: 'test' } });
transport.stderr.on('data', () => {});

try {
  await client.connect(transport);
  const list = await client.listTools();
  assert.deepEqual(new Set(list.tools.map((tool) => tool.name)),
    new Set(['genos_signal_plasmid_transfer', 'genos_signal_collective_decision']));
  for (const request of [
    { name: 'genos_signal_plasmid_transfer', arguments: { problem: 'choice', voters: [{ agentId: 'a' }] } },
    { name: 'genos_signal_collective_decision', arguments: { problem: 'choice', voters: [], mode: 'stigmergic' } },
    { name: 'genos_signal_collective_decision', arguments: { problem: 'choice', voters: [], mode: 'plasmid' } }
  ]) {
    const result = await client.callTool(request);
    assert.equal(result.isError, true, `${request.name} must not claim execution`);
    assert.match(result.content[0].text, /no .* (transfer|adapter)|no execution adapter/i);
  }
  console.log('Unimplemented signal modes refuse execution through real MCP stdio.');
} finally {
  await client.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
