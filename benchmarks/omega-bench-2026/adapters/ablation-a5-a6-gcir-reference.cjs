'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const reference = require('./json_reference.cjs');
const genos = require('./genos_full.cjs');
const { createRuntime } = require(path.resolve(__dirname, '..', '..', '..', 'backend',
  'src', 'services', 'cognitiveOmegaRuntimeService'));
const compiler = require(path.resolve(__dirname, '..', '..', '..', 'backend',
  'src', 'services', 'cognitiveOmegaCompiler'));
const interop = require(path.resolve(__dirname, '..', '..', '..', 'backend',
  'src', 'services', 'cognitiveOmegaInteropService'));

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const DATASET_ROOT = process.env.OMEGA_DATASET_ROOT || path.join(ROOT, 'dataset');
const EXPERIMENTS = ['E10', 'E11'];

function operationsFor(row) {
  return [{ id: 'read', kind: 'READ', reference: 'bench/input', dependsOn: [], state: 'open' },
    { id: 'select', kind: 'SELECT', reference: 'bench/input', dependsOn: ['read'], state: 'open' },
    { id: 'call', kind: 'CALL', reference: `bench/${row.experiment_id}`,
      dependsOn: ['select'], state: 'open' }];
}

function envelopeFor(row, operations) {
  return { schema: interop.SCHEMA, version: 1, id: row.scenario_id, operations,
    policy: policyFor(row), payload: row.input };
}

function policyFor(row) {
  return { read: ['bench/input'], select: ['bench/input'],
    call: [`bench/${row.experiment_id}`] };
}

async function executeControl(row) {
  const operations = operationsFor(row);
  if (!interop.validate(envelopeFor(row, operations)).valid) {
    throw new Error('ablation_gcir_envelope_invalid');
  }
  const compiled = compiler.compile({ operations, targets: ['call'],
    model: 'deterministic-benchmark-handler' });
  if (compiled.status !== 'ready') throw new Error(`compile_${compiled.status}`);
  const runtime = createRuntime();
  runtime.registerReader('bench/input', async () => row.input);
  runtime.registerTool(`bench/${row.experiment_id}`, async ({ input }) => ({
    value: reference.execute({ ...row, input }, null)
  }));
  const result = await runtime.execute({ operations: compiled.slice.nodes,
    policy: policyFor(row), allowEmit: true });
  if (result.status !== 'emitted' || result.values.call?.value === undefined) {
    throw new Error(`gcir_runtime_${result.reason || result.status}`);
  }
  return { answer: result.values.call.value, metrics: { gcir_static_validation: 'passed',
    gcir_runtime: 'emitted', gcir_operations: operations.length,
    handler: `json_reference.${row.experiment_id}` } };
}

async function timedRow(row, repetition) {
  const started = performance.now();
  const output = await executeControl(row);
  return { scenario_id: row.scenario_id, experiment_id: row.experiment_id,
    condition_id: row.experiment_id === 'E10' ? 'A5' : 'A6', repetition,
    status: 'completed', answer: output.answer, metrics: output.metrics,
    telemetry: { latency_ms: performance.now() - started,
      input_bytes: Buffer.byteLength(JSON.stringify(row.input)),
      output_bytes: Buffer.byteLength(JSON.stringify(output.answer)),
      input_tokens: null, output_tokens: null, cost_usd: null } };
}

function writeResults(input) {
  const { experiment, rows, results } = input;
  const condition = experiment === 'E10' ? 'A5' : 'A6';
  const outputPath = path.join(ROOT, 'results', `ABLATION-${condition}.jsonl`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${results.map((result) => JSON.stringify(result)).join('\n')}\n`);
  const manifest = manifestFor({ experiment, rows, results, outputPath });
  fs.writeFileSync(outputPath.replace(/\.jsonl$/i, '.manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`);
}

function manifestFor(input) {
  const { experiment, rows, results, outputPath } = input;
  const condition = experiment === 'E10' ? 'A5' : 'A6';
  const hashFile = (filename) => crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(REPO, filename))).digest('hex');
  return { protocol: 'OMEGA-BENCH-2026', condition_id: condition,
    status: 'scoped_gcir_runtime_reference_handler_control', scope: [experiment],
    scenarios: rows.length, repetitions: 3, runs: results.length,
    control: 'same D envelope validation, compiler, policy and runtime; only CALL handler is reference',
    repository_revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(),
    adapter_sha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    genos_adapter_sha256: hashFile('benchmarks/omega-bench-2026/adapters/genos_full.cjs'),
    runtime_sha256: hashFile('backend/src/services/cognitiveOmegaRuntimeService.js'),
    compiler_sha256: hashFile('backend/src/services/cognitiveOmegaCompiler.js'),
    interop_sha256: hashFile('backend/src/services/cognitiveOmegaInteropService.js'),
    dataset_manifest_sha256: hashFile('benchmarks/omega-bench-2026/dataset/manifest.json'),
    runtime: { node: process.version, platform: process.platform, arch: process.arch,
      cpu: os.cpus()[0]?.model || null, memory_bytes: os.totalmem() },
    result_file: path.basename(outputPath), external_model_calls: 0 };
}

async function runExperiment(experiment, harness) {
  const inputPath = path.join(DATASET_ROOT, 'public', 'inputs', `${experiment}.jsonl`);
  const rows = reference.readRows(inputPath);
  const results = [];
  for (let repetition = 1; repetition <= 3; repetition += 1) {
    for (const row of rows) results.push(await timedRow(row, repetition));
  }
  writeResults({ experiment, rows, results });
  process.stdout.write(`${experiment} reference handler: ${results.length} runs.\n`);
}

async function main() {
  genos.configureAuthority();
  const harness = await genos.createHarness();
  try {
    for (const experiment of EXPERIMENTS) await runExperiment(experiment, harness);
  } finally {
    await genos.closeHarness(harness);
  }
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

module.exports = { envelopeFor, operationsFor };
