'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const net = require('node:net');

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const DATASET_ROOT = process.env.OMEGA_DATASET_ROOT || path.join(ROOT, 'dataset');
const INPUTS_ROOT = process.env.OMEGA_DATASET_INPUTS || path.join(DATASET_ROOT, 'public', 'inputs');
const PRIVATE_TOOLS = path.join(process.env.LOCALAPPDATA || '', 'OMEGA-BENCH-2026', 'tools');
const OPA_BINARY = process.env.OMEGA_OPA_BINARY || path.join(PRIVATE_TOOLS, 'opa-1.21.4-windows-amd64.exe');
const OPA_POLICY = path.join(__dirname, 'opa.rego');
const reference = require('./json_reference.cjs');
const traces = require('../src/run-trace.cjs');
const REPETITIONS = 3;
const EXPERIMENTS = ['E03', 'E08'];

function verifyBinary() {
  const result = spawnSync(OPA_BINARY, ['version'], { encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout.includes('Version: 1.21.4')) {
    throw new Error('OPA 1.21.4 binary is missing or has a different version.');
  }
}

async function freePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.listen(0, '127.0.0.1', resolve).on('error', reject));
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

function startServer(port) {
  return spawn(OPA_BINARY, ['run', '--server', '--addr', `127.0.0.1:${port}`, OPA_POLICY], {
    windowsHide: true, stdio: 'ignore'
  });
}

async function waitForServer(port, child) {
  const url = `http://127.0.0.1:${port}/health`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error('OPA server exited during startup.');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(250) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  throw new Error('OPA server did not become healthy within 10 seconds.');
}

function queryFor(row) {
  return row.experiment_id === 'E03'
    ? { endpoint: 'typing_valid', input: row.input.candidate }
    : { endpoint: 'allowed', input: row.input };
}

async function policyDecision(port, input) {
  const response = await fetch(`http://127.0.0.1:${port}/v1/data/omega/allowed`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input })
  });
  if (!response.ok) throw new Error(`OPA mission policy returned HTTP ${response.status}.`);
  return Boolean((await response.json()).result);
}

async function missionExecution(row, port) {
  const workload = row.input.mission_workload;
  if (workload?.kind !== 'security_filter') return undefined;
  const decisions = [];
  for (const command of workload.commands) {
    decisions.push(await policyDecision(port, { ...command, policy: workload.policy }));
  }
  return { decisions, executed_effects: decisions.filter(Boolean).length, violations: [] };
}

async function runRow(row, repetition, port) {
  const trace = traces.start({ scenario_id: row.scenario_id, experiment_id: row.experiment_id,
    condition_id: 'OPA', repetition }, row.input);
  const query = queryFor(row);
  const payload = JSON.stringify({ input: query.input });
  const started = performance.now();
  const response = await fetch(`http://127.0.0.1:${port}/v1/data/omega/${query.endpoint}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: payload
  });
  if (!response.ok) throw new Error(`OPA returned HTTP ${response.status}.`);
  const result = await response.json();
  traces.phase(trace, 'opa_policy_decision_observed');
  const latency = performance.now() - started;
  const allowed = Boolean(result.result);
  const answer = row.experiment_id === 'E03'
    ? { accepted: allowed }
    : { allowed, executed_effects: allowed ? ['requested_action'] : [] };
  const mission = await missionExecution(row, port);
  if (mission) answer.mission_execution = mission;
  if (mission) traces.phase(trace, 'opa_mission_outcome_observed');
  traces.finish(trace, answer);
  const output = JSON.stringify(answer);
  return {
    scenario_id: row.scenario_id, experiment_id: row.experiment_id,
    condition_id: 'OPA', repetition, status: 'completed', answer,
    telemetry: { latency_ms: latency, input_bytes: Buffer.byteLength(payload),
      output_bytes: Buffer.byteLength(output), input_tokens: null,
      output_tokens: null, cost_usd: null }
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
    protocol: 'OMEGA-BENCH-2026', condition_id: 'OPA', status: 'scoped_external_baseline',
    scope: EXPERIMENTS, scenarios: rows.length, repetitions: REPETITIONS, runs: results.length,
    engine: 'open-policy-agent/opa@v1.21.4', repository_revision: spawnSync('git',
      ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim(),
    adapter_sha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    policy_sha256: crypto.createHash('sha256').update(fs.readFileSync(OPA_POLICY)).digest('hex'),
    dataset_manifest_sha256: crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(DATASET_ROOT, 'manifest.json'))).digest('hex'),
    runtime: { node: process.version, platform: process.platform, arch: process.arch,
      cpu: os.cpus()[0]?.model || null, memory_bytes: os.totalmem() },
    external_model_calls: 0
  };
  Object.assign(manifest, traces.writeSidecar(outputPath, 'OPA'));
  fs.writeFileSync(outputPath.replace(/\.jsonl$/i, '.manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  verifyBinary();
  const rows = datasetRows();
  const port = await freePort();
  const child = startServer(port);
  const results = [];
  const outputPath = process.argv[2] || path.join(ROOT, 'results', 'OPA-baseline.jsonl');
  try {
    await waitForServer(port, child);
    for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
      for (const row of rows) results.push(await runRow(row, repetition, port));
    }
    writeResults(rows, outputPath, results);
  } finally {
    child.kill();
  }
  process.stdout.write(`OPA baseline complete: ${results.length} runs across ${rows.length} scoped cases.\n`);
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

module.exports = { missionExecution, policyDecision, queryFor, runRow };
