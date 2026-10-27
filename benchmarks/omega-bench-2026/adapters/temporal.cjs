'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { performance } = require('node:perf_hooks');
const net = require('node:net');

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const RUNTIME = path.join(__dirname, 'temporal-runtime');
const temporalRequire = createRequire(path.join(RUNTIME, 'package.json'));
const DATASET_ROOT = process.env.OMEGA_DATASET_ROOT || path.join(ROOT, 'dataset');
const INPUTS_ROOT = process.env.OMEGA_DATASET_INPUTS || path.join(DATASET_ROOT, 'public', 'inputs');
const TEMPORAL_CLI = process.env.OMEGA_TEMPORAL_CLI || path.join(
  process.env.LOCALAPPDATA || '', 'OMEGA-BENCH-2026', 'tools',
  'temporal-cli-v1.9.1', 'temporal.exe');
const EXPERIMENTS = ['E05', 'E06', 'E07'];
const REPETITIONS = 3;

function loadSdk() {
  const client = temporalRequire('@temporalio/client');
  const worker = temporalRequire('@temporalio/worker');
  return { Client: client.Client, Connection: client.Connection,
    DefaultLogger: worker.DefaultLogger, NativeConnection: worker.NativeConnection,
    Worker: worker.Worker };
}

async function freePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.listen(0, '127.0.0.1', resolve).on('error', reject));
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

function startServer(port, database) {
  return spawn(TEMPORAL_CLI, ['server', 'start-dev', '--headless', '--port', String(port),
    '--db-filename', database], { windowsHide: true, stdio: 'ignore' });
}

async function connectClient(Connection, address, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error('Temporal development server exited during startup.');
    try {
      return await Connection.connect({ address });
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 125));
    }
  }
  throw new Error('Temporal development server did not become ready within 10 seconds.');
}

function datasetRows() {
  const reference = require('./json_reference.cjs');
  return EXPERIMENTS.flatMap((experiment) => reference.readRows(
    path.join(INPUTS_ROOT, `${experiment}.jsonl`)));
}

async function runRow(row, repetition, context) {
  const input = JSON.stringify(row.input);
  const workflowId = `omega-${row.scenario_id}-r${repetition}`;
  const started = performance.now();
  const execution = await context.client.workflow.start('omegaWorkflow', {
    args: [row.experiment_id, row.input], taskQueue: context.taskQueue, workflowId
  });
  const answer = await execution.result();
  if (row.experiment_id === 'E05') {
    context.replayHistories.push({ history: await execution.fetchHistory(), workflowId });
  }
  const latency = performance.now() - started;
  return {
    scenario_id: row.scenario_id, experiment_id: row.experiment_id,
    condition_id: 'TEMPORAL', repetition, status: 'completed', answer,
    metrics: row.experiment_id === 'E05' ? { replay_verified: false } : undefined,
    telemetry: { latency_ms: latency, input_bytes: Buffer.byteLength(input),
      output_bytes: Buffer.byteLength(JSON.stringify(answer)), input_tokens: null,
      output_tokens: null, cost_usd: null }
  };
}

function writeResults(rows, outputPath, results) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${results.map((row) => JSON.stringify(row)).join('\n')}\n`);
  const manifest = {
    protocol: 'OMEGA-BENCH-2026', condition_id: 'TEMPORAL',
    status: 'scoped_external_baseline', scope: EXPERIMENTS,
    scenarios: rows.length, repetitions: REPETITIONS, runs: results.length,
    sdk: '@temporalio/client|worker|workflow@1.25.0', temporal_cli: '1.9.1 (server 1.32.0)',
    repository_revision: spawnSync('git', ['rev-parse', 'HEAD'],
      { cwd: REPO, encoding: 'utf8' }).stdout.trim(),
    adapter_sha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    workflow_sha256: crypto.createHash('sha256').update(fs.readFileSync(
      path.join(RUNTIME, 'workflows.js'))).digest('hex'),
    activity_sha256: crypto.createHash('sha256').update(fs.readFileSync(
      path.join(RUNTIME, 'activities.js'))).digest('hex'),
    dataset_manifest_sha256: crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(DATASET_ROOT, 'manifest.json'))).digest('hex'),
    runtime: { node: process.version, platform: process.platform, arch: process.arch,
      cpu: os.cpus()[0]?.model || null, memory_bytes: os.totalmem() },
    external_model_calls: 0
  };
  fs.writeFileSync(outputPath.replace(/\.jsonl$/i, '.manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`);
}

async function runCampaign(rows, context, repetitions) {
  const results = [];
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    for (const row of rows) results.push(await runRow(row, repetition, context));
  }
  return results;
}

async function replayHistories(sdk, histories, evidence) {
  const replayed = new Set();
  const options = { workflowsPath: evidence.workflowsPath,
    logger: new sdk.DefaultLogger('ERROR') };
  for await (const result of sdk.Worker.runReplayHistories(options, histories)) {
    if (result.error) throw result.error;
    replayed.add(result.workflowId);
  }
  for (const result of evidence.results.filter((row) => row.experiment_id === 'E05')) {
    result.metrics.replay_verified = replayed.has(`omega-${result.scenario_id}-r${result.repetition}`);
  }
  return replayed.size;
}

async function main() {
  const sdk = loadSdk();
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-temporal-'));
  const port = await freePort();
  const child = startServer(port, path.join(temporary, 'temporal.db'));
  let worker;
  let workerConnection;
  let clientConnection;
  let workerPromise;
  const outputPath = process.argv[2] || path.join(ROOT, 'results', 'TEMPORAL-baseline.jsonl');
  const rows = datasetRows();
  process.env.OMEGA_TEMPORAL_LEDGER = path.join(temporary, 'activity-ledger.json');
  try {
    clientConnection = await connectClient(sdk.Connection, `127.0.0.1:${port}`, child);
    workerConnection = await sdk.NativeConnection.connect({ address: `127.0.0.1:${port}` });
    const taskQueue = `omega-${crypto.randomUUID()}`;
    worker = await sdk.Worker.create({ connection: workerConnection, taskQueue,
      workflowsPath: temporalRequire.resolve('./workflows.js'),
      activities: temporalRequire('./activities.js'), logger: new sdk.DefaultLogger('ERROR') });
    workerPromise = worker.run();
    const workflowsPath = temporalRequire.resolve('./workflows.js');
    const context = { client: new sdk.Client({ connection: clientConnection }), taskQueue,
      replayHistories: [] };
    const results = await runCampaign(rows, context, REPETITIONS);
    const replayCount = await replayHistories(sdk, context.replayHistories,
      { workflowsPath, results });
    if (replayCount !== context.replayHistories.length) throw new Error('Temporal replay count mismatch.');
    writeResults(rows, outputPath, results);
  } finally {
    if (worker) {
      worker.shutdown();
      await workerPromise;
    }
    if (workerConnection) await workerConnection.close();
    if (clientConnection) await clientConnection.close();
    child.kill();
  }
  process.stdout.write(`Temporal baseline complete: ${rows.length * REPETITIONS} runs across ${rows.length} scoped cases.\n`);
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

module.exports = { runRow };
