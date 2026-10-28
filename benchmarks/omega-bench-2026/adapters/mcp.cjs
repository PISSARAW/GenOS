'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { performance } = require('node:perf_hooks');

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const DATASET_ROOT = process.env.OMEGA_DATASET_ROOT || path.join(ROOT, 'dataset');
const INPUTS_ROOT = process.env.OMEGA_DATASET_INPUTS || path.join(DATASET_ROOT, 'public', 'inputs');
const mcpRequire = createRequire(path.join(REPO, 'mcp', 'package.json'));
const { Client } = mcpRequire('@modelcontextprotocol/sdk/client');
const { McpServer } = mcpRequire('@modelcontextprotocol/sdk/server/mcp.js');
const { InMemoryTransport } = mcpRequire('@modelcontextprotocol/sdk/inMemory.js');
const { z } = mcpRequire('zod');
const reference = require('./json_reference.cjs');
const traces = require('../src/run-trace.cjs');
const REPETITIONS = 3;
const EXPERIMENTS = ['E07', 'E12'];

function createServer(validator) {
  const server = new McpServer({ name: 'omega-bench-mcp-baseline', version: '1.31.0' });
  server.registerTool('execute_case', {
    description: 'Execute one deterministic OMEGA scenario through a typed MCP tool call.',
    inputSchema: { scenario: z.any() }
  }, async ({ scenario }) => ({
    content: [{ type: 'text', text: JSON.stringify(reference.execute(scenario, validator)) }]
  }));
  return server;
}

async function connectPair(server) {
  const client = new Client({ name: 'omega-bench-mcp-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

async function runRow(row, repetition, client) {
  const trace = traces.start({ scenario_id: row.scenario_id, experiment_id: row.experiment_id,
    condition_id: 'MCP', repetition }, row.input);
  const input = JSON.stringify(row.input);
  const started = performance.now();
  const response = await client.callTool({ name: 'execute_case', arguments: { scenario: row } });
  const latency = performance.now() - started;
  const text = response.content?.find((item) => item.type === 'text')?.text;
  const answer = text ? JSON.parse(text) : null;
  traces.phase(trace, 'mcp_tool_result_observed');
  traces.finish(trace, answer, response.isError || answer === null ? 'failed' : 'completed');
  return {
    scenario_id: row.scenario_id, experiment_id: row.experiment_id,
    condition_id: 'MCP', repetition,
    status: response.isError || answer === null ? 'failed' : 'completed', answer,
    telemetry: {
      latency_ms: latency, input_bytes: Buffer.byteLength(input),
      output_bytes: Buffer.byteLength(text || ''), input_tokens: null,
      output_tokens: null, cost_usd: null
    }
  };
}

function datasetRows() {
  return EXPERIMENTS.flatMap((experiment) => reference.readRows(
    path.join(INPUTS_ROOT, `${experiment}.jsonl`)));
}

function writeResults(rows, outputPath, results) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${results.map((row) => JSON.stringify(row)).join('\n')}\n`);
  const manifest = {
    protocol: 'OMEGA-BENCH-2026', condition_id: 'MCP',
    status: 'scoped_external_baseline', scope: EXPERIMENTS,
    scenarios: rows.length, repetitions: REPETITIONS, runs: results.length,
    sdk: '@modelcontextprotocol/sdk@1.31.0', repository_revision: require('node:child_process')
      .execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(),
    adapter_sha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    dataset_manifest_sha256: crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(DATASET_ROOT, 'manifest.json'))).digest('hex'),
    runtime: { node: process.version, platform: process.platform, arch: process.arch,
      cpu: os.cpus()[0]?.model || null, memory_bytes: os.totalmem() },
    external_model_calls: 0
  };
  Object.assign(manifest, traces.writeSidecar(outputPath, 'MCP'));
  const manifestPath = outputPath.replace(/\.jsonl$/i, '.manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  const rows = datasetRows();
  const validator = reference.createValidator();
  const server = createServer(validator);
  const client = await connectPair(server);
  const outputPath = process.argv[2] || path.join(ROOT, 'results', 'MCP-baseline.jsonl');
  const results = [];
  try {
    for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
      for (const row of rows) results.push(await runRow(row, repetition, client));
    }
    writeResults(rows, outputPath, results);
  } finally {
    await client.close();
    await server.close();
  }
  process.stdout.write(`MCP baseline complete: ${results.length} runs across ${rows.length} scoped cases.\n`);
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

module.exports = { createServer, runRow };
