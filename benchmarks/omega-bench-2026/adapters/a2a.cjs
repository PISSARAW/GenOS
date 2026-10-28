'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { performance } = require('node:perf_hooks');

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const INPUTS_ROOT = process.env.OMEGA_DATASET_INPUTS
  || path.join(ROOT, 'dataset', 'public', 'inputs');
const RUNTIME = path.join(__dirname, 'a2a-runtime');
const sdkRequire = createRequire(path.join(RUNTIME, 'package.json'));
const express = sdkRequire('express');
const { ClientFactory } = sdkRequire('@a2a-js/sdk/client');
const { AgentEvent, DefaultRequestHandler, InMemoryTaskStore } = sdkRequire('@a2a-js/sdk/server');
const { agentCardHandler, jsonRpcHandler, UserBuilder } = sdkRequire('@a2a-js/sdk/server/express');
const { Role } = sdkRequire('@a2a-js/sdk');
const reference = require('./json_reference.cjs');
const traces = require('../src/run-trace.cjs');
const EXPERIMENTS = ['E07', 'E12'];
const REPETITIONS = 3;

function makeCard(url) {
  return {
    name: 'OMEGA A2A baseline', description: 'Deterministic OMEGA scenario executor',
    url, version: '1.3.0', protocolVersion: '1.0', preferredTransport: 'JSONRPC',
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ['text/plain'], defaultOutputModes: ['text/plain'],
    skills: [{ id: 'execute_case', name: 'Execute case', description: 'Run one scenario',
      tags: ['benchmark'], examples: [], inputModes: ['text/plain'], outputModes: ['text/plain'] }],
    supportedInterfaces: [{ url, protocolBinding: 'JSONRPC', protocolVersion: '1.0' }]
  };
}

function createHandler(card, validator) {
  const executor = {
    async execute(context, bus) {
      const payload = JSON.parse(context.userMessage.parts[0].content.value);
      const answer = reference.execute(payload, validator);
      bus.publish(AgentEvent.message({ messageId: crypto.randomUUID(), role: Role.ROLE_AGENT,
        parts: [{ content: { $case: 'text', value: JSON.stringify(answer) }, mediaType: 'text/plain' }],
        contextId: context.contextId,
        taskId: context.taskId, extensions: [], referenceTaskIds: [] }));
    },
    async cancelTask() {}
  };
  return new DefaultRequestHandler(card, new InMemoryTaskStore(), executor);
}

function makeServer(handler) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/.well-known/agent-card.json', agentCardHandler({ agentCardProvider: handler }));
  app.use(jsonRpcHandler({ requestHandler: handler, userBuilder: UserBuilder.noAuthentication }));
  return app;
}

function inputRows() {
  return EXPERIMENTS.flatMap((experiment) => reference.readRows(
    path.join(INPUTS_ROOT, `${experiment}.jsonl`)));
}

async function runCase(row, repetition, client) {
  const trace = traces.start({ scenario_id: row.scenario_id, experiment_id: row.experiment_id,
    condition_id: 'A2A', repetition }, row.input);
  const serialized = JSON.stringify(row);
  const started = performance.now();
  const result = await client.sendMessage({ message: {
    messageId: crypto.randomUUID(), role: Role.ROLE_USER,
    parts: [{ content: { $case: 'text', value: serialized }, mediaType: 'text/plain' }],
    contextId: crypto.randomUUID(), extensions: [], referenceTaskIds: []
  } });
  const answerText = result.parts?.find((part) => part.content?.$case === 'text')?.content.value;
  const answer = answerText ? JSON.parse(answerText) : null;
  traces.phase(trace, 'a2a_response_observed');
  traces.finish(trace, answer, answer === null ? 'failed' : 'completed');
  return {
    scenario_id: row.scenario_id, experiment_id: row.experiment_id,
    condition_id: 'A2A', repetition,
    status: answer === null ? 'failed' : 'completed', answer,
    telemetry: { latency_ms: performance.now() - started,
      input_bytes: Buffer.byteLength(serialized), output_bytes: Buffer.byteLength(answerText || ''),
      input_tokens: null, output_tokens: null, cost_usd: null }
  };
}

function writeResults(rows, results, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${results.map((row) => JSON.stringify(row)).join('\n')}\n`);
  const manifest = {
    protocol: 'OMEGA-BENCH-2026', condition_id: 'A2A', status: 'scoped_external_baseline',
    scope: EXPERIMENTS, scenarios: rows.length, repetitions: REPETITIONS, runs: results.length,
    sdk: '@a2a-js/sdk@1.3.0', repository_revision: require('node:child_process')
      .execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(),
    adapter_sha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    dataset_manifest_sha256: crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(ROOT, 'dataset', 'manifest.json'))).digest('hex'),
    runtime: { node: process.version, platform: process.platform, arch: process.arch,
      cpu: os.cpus()[0]?.model || null, memory_bytes: os.totalmem() }, external_model_calls: 0
  };
  Object.assign(manifest, traces.writeSidecar(outputPath, 'A2A'));
  fs.writeFileSync(outputPath.replace(/\.jsonl$/i, '.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  const rows = inputRows();
  const validator = reference.createValidator();
  const listener = await new Promise((resolve) => {
    const server = require('node:http').createServer(makeServer(createHandler(makeCard('http://127.0.0.1:0'), validator)));
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
  const address = listener.address();
  const cardUrl = `http://127.0.0.1:${address.port}`;
  await new Promise((resolve) => listener.close(resolve));
  const handler = createHandler(makeCard(cardUrl), validator);
  const appServer = require('node:http').createServer(makeServer(handler));
  await new Promise((resolve) => appServer.listen(address.port, '127.0.0.1', resolve));
  const client = await new ClientFactory().createFromUrl(cardUrl);
  const outputPath = process.argv[2] || path.join(ROOT, 'results', 'A2A-baseline.jsonl');
  const results = [];
  try {
    for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
      for (const row of rows) results.push(await runCase(row, repetition, client));
    }
    writeResults(rows, results, outputPath);
  } finally {
    await new Promise((resolve, reject) => appServer.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
