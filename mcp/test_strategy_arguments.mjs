import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(import.meta.dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-mcp-strategy-'));
const client = new Client({ name: 'strategy-arguments-test', version: '1' });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'mcp/index.js')],
  cwd: root, stderr: 'pipe', env: { ...process.env,
    GENOS_MCP_LEASE: 'genos_execute_primitive,genos_execute_strategy_pipeline',
    GENOS_DB_PATH: path.join(temporary, 'strategy.db'), NODE_ENV: 'test' } });
transport.stderr.on('data', () => {});

function output(result) {
  assert.notEqual(result.isError, true, result.content?.[0]?.text);
  return JSON.parse(result.content[0].text);
}

const probes = [
  { id: 'balanced', outcomes: [{ probability: 0.5 }, { probability: 0.5 }] },
  { id: 'certain', outcomes: [{ probability: 1 }] }
];

try {
  await client.connect(transport);
  const one = output(await client.callTool({ name: 'genos_execute_primitive', arguments: {
    primitive_name: 'expected_information_gain', args: { probes } } }));
  assert.equal(one.success, true);
  assert.equal(one.best.id, 'balanced');
  assert.equal(one.best.expectedInformationGain, 1);

  const pipeline = output(await client.callTool({ name: 'genos_execute_strategy_pipeline', arguments: {
    primitives: ['expected_information_gain', 'next_probe'], context: { probes } } }));
  assert.equal(pipeline.success, true);
  assert.deepEqual(pipeline.results.map((entry) => entry.primitive), ['expected_information_gain', 'next_probe']);
  assert.equal(pipeline.results[1].result.selectedProbe.id, 'balanced');

  const unknown = await client.callTool({ name: 'genos_execute_primitive', arguments: {
    primitive_name: 'missing_primitive', args: {} } });
  assert.equal(unknown.isError, true);
  console.log('MCP primitive arguments, ordered pipeline and unknown-primitive refusal verified.');
} finally {
  await client.close();
  assert.ok(path.resolve(temporary).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  fs.rmSync(temporary, { recursive: true, force: true });
}
