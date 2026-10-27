'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const reference = require('./json_reference.cjs');
const { createRuntime } = require(path.resolve(__dirname, '..', '..', '..', 'backend', 'src', 'services', 'cognitiveOmegaRuntimeService'));
const compiler = require(path.resolve(__dirname, '..', '..', '..', 'backend', 'src', 'services', 'cognitiveOmegaCompiler'));
const omegaInterop = require(path.resolve(__dirname, '..', '..', '..', 'backend', 'src', 'services', 'cognitiveOmegaInteropService'));

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const DATASET_ROOT = process.env.OMEGA_DATASET_ROOT || path.join(ROOT, 'dataset');
const INPUTS_ROOT = process.env.OMEGA_DATASET_INPUTS || path.join(DATASET_ROOT, 'public', 'inputs');
function operationsFor(row) {
  const action = `bench/${row.experiment_id}`;
  return [
    { id: 'read', kind: 'READ', reference: 'bench/input', dependsOn: [] },
    { id: 'select', kind: 'SELECT', reference: 'bench/input', dependsOn: ['read'] },
    { id: 'call', kind: 'CALL', reference: action, dependsOn: ['select'] }
  ];
}

function createRuntimeFor(row) {
  const runtime = createRuntime();
  runtime.registerReader('bench/input', async () => row.input);
  runtime.registerTool(`bench/${row.experiment_id}`, async ({ input }) => {
    const task = { ...row, input };
    return row.experiment_id === 'E03' ? { accepted: omegaInterop.validate(input.candidate).valid } : reference.execute(task, null);
  });
  return runtime;
}

function policyFor(row) {
  return {
    read: ['bench/input'], select: ['bench/input'], call: [`bench/${row.experiment_id}`]
  };
}

async function executeRow(row) {
  const operations = operationsFor(row);
  const compiled = compiler.compile({ operations, targets: ['call'], model: 'deterministic-benchmark-handler' });
  if (compiled.status !== 'ready') throw new Error(`compile_${compiled.status}`);
  const runtime = createRuntimeFor(row);
  const result = await runtime.execute({ operations: compiled.slice.nodes, policy: policyFor(row), allowEmit: true });
  if (result.status !== 'emitted' || result.values.call === undefined) throw new Error(`runtime_${result.reason || result.status}`);
  return result.values.call;
}

async function timedRow(row, repetition) {
  const input = JSON.stringify(row.input);
  const started = performance.now();
  const answer = await executeRow(row);
  const latency = performance.now() - started;
  const output = JSON.stringify(answer);
  return {
    scenario_id: row.scenario_id, experiment_id: row.experiment_id, condition_id: 'B', repetition,
    status: 'completed', answer,
    telemetry: { latency_ms: latency, input_bytes: Buffer.byteLength(input), output_bytes: Buffer.byteLength(output), input_tokens: null, output_tokens: null, cost_usd: null }
  };
}

function manifestFor(rows, outputPath) {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
  const datasetManifest = path.join(DATASET_ROOT, 'manifest.json');
  return {
    protocol: 'OMEGA-BENCH-2026', condition_id: 'B', status: 'minimal_gcir_runtime_with_reference_workload_handlers',
    scenarios: rows.length, repetitions: 3, runs: rows.length * 3, repository_revision: revision,
    adapter_sha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    dataset_manifest_sha256: crypto.createHash('sha256').update(fs.readFileSync(datasetManifest)).digest('hex'),
    runtime: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model || null, memory_bytes: os.totalmem() },
    result_file: path.basename(outputPath), external_model_calls: 0
  };
}

async function main() {
  const experiments = Array.from({ length: 12 }, (_, index) => `E${String(index + 1).padStart(2, '0')}`);
  const rows = experiments.flatMap((experiment) => reference.readRows(path.join(INPUTS_ROOT, `${experiment}.jsonl`)));
  const outputPath = process.argv[2] || path.join(ROOT, 'results', 'B-gcir-minimal.jsonl');
  const results = [];
  for (let repetition = 1; repetition <= 3; repetition += 1) {
    for (const row of rows) results.push(await timedRow(row, repetition));
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${results.map((item) => JSON.stringify(item)).join('\n')}\n`);
  fs.writeFileSync(outputPath.replace(/\.jsonl$/i, '.manifest.json'), `${JSON.stringify(manifestFor(rows, outputPath), null, 2)}\n`);
  process.stdout.write(`Condition B complete: ${results.length} G-CIR minimal runs across ${rows.length} cases.\n`);
}

main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
