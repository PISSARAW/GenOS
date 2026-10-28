'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const reference = require('./json_reference.cjs');
const compiler = require(path.resolve(__dirname, '..', '..', '..', 'backend', 'src', 'services', 'cognitiveOmegaCompiler'));
const runtimeModule = require(path.resolve(__dirname, '..', '..', '..', 'backend', 'src', 'services', 'cognitiveOmegaRuntimeService'));
const interop = require(path.resolve(__dirname, '..', '..', '..', 'backend', 'src', 'services', 'cognitiveOmegaInteropService'));
const { transformE04 } = require('./e04-optimizer.cjs');
const traces = require('../src/run-trace.cjs');

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const DATASET_ROOT = process.env.OMEGA_DATASET_ROOT || path.join(ROOT, 'dataset');
const INPUTS_ROOT = process.env.OMEGA_DATASET_INPUTS || path.join(DATASET_ROOT, 'public', 'inputs');
const REPETITIONS = 3;

function operationsFor(row) {
  return [
    { id: 'read', kind: 'READ', reference: 'bench/input', dependsOn: [], state: 'open' },
    { id: 'select', kind: 'SELECT', reference: 'bench/input', dependsOn: ['read'], state: 'open' },
    { id: 'call', kind: 'CALL', reference: `bench/${row.experiment_id}`, dependsOn: ['select'], state: 'open' }
  ];
}

function envelopeFor(row, operations) {
  return { schema: interop.SCHEMA, version: 1, id: row.scenario_id, operations,
    policy: { read: ['bench/input'], select: ['bench/input'], call: [`bench/${row.experiment_id}`] },
    payload: row.input };
}

function taskInput(row) {
  if (row.experiment_id !== 'E04') {
    return { input: row.input, optimization: null };
  }
  const optimized = transformE04(row.input,
    (input) => reference.execute({ ...row, input }, null));
  return { input: optimized.input, optimization: optimized };
}

function registerHandlers(runtime, row, input) {
  runtime.registerReader('bench/input', async () => input);
  runtime.registerTool(`bench/${row.experiment_id}`, async ({ input: selected }) => {
    const task = { ...row, input: selected };
    if (row.experiment_id === 'E03') return { accepted: interop.validate(selected.candidate).valid,
      mission_execution: reference.executeMissionWorkload(selected.mission_workload) };
    return reference.execute(task, null);
  });
}

function executeRow(row, trace) {
  const operations = operationsFor(row);
  const staticResult = interop.validate(envelopeFor(row, operations));
  if (!staticResult.valid) throw new Error(`static_validation_${staticResult.errors[0] || 'invalid'}`);
  if (trace) traces.phase(trace, 'static_validation_completed');
  const task = taskInput(row);
  const compiled = compiler.compile({ operations, targets: ['call'], model: 'deterministic-benchmark-handler' });
  if (compiled.status !== 'ready') throw new Error(`compile_${compiled.status}`);
  if (trace) traces.phase(trace, 'gcir_compile_completed');
  const runtime = runtimeModule.createRuntime();
  registerHandlers(runtime, row, task.input);
  return runtime.execute({ operations: compiled.slice.nodes,
    policy: { read: ['bench/input'], select: ['bench/input'], call: [`bench/${row.experiment_id}`] }, allowEmit: true })
    .then((result) => executionAnswer(result, task.optimization));
}

function executionAnswer(result, optimization) {
  if (result.status !== 'emitted' || result.values.call === undefined) {
    throw new Error(`runtime_${result.reason || result.status}`);
  }
  const passes = optimization?.passes || [];
  return { answer: result.values.call, metrics: {
    static_validation: 'passed', e04_transformations: passes,
    e04_all_invariants_preserved: optimization?.all_invariants_preserved ?? null
  } };
}

async function timedRow(row, repetition) {
  const trace = traces.start({ scenario_id: row.scenario_id, experiment_id: row.experiment_id,
    condition_id: 'C', repetition }, row.input);
  const input = JSON.stringify(row.input);
  const started = performance.now();
  const output = await executeRow(row, trace);
  traces.phase(trace, row.experiment_id === 'E04' ? 'optimization_and_runtime_completed'
    : 'gcir_runtime_completed');
  traces.finish(trace, output.answer);
  const latency = performance.now() - started;
  return {
    scenario_id: row.scenario_id, experiment_id: row.experiment_id, condition_id: 'C',
    repetition, status: 'completed', answer: output.answer, metrics: output.metrics,
    telemetry: { latency_ms: latency, input_bytes: Buffer.byteLength(input),
      output_bytes: Buffer.byteLength(JSON.stringify(output.answer)),
      input_tokens: null, output_tokens: null, cost_usd: null }
  };
}

function manifestFor(rows, outputPath) {
  const datasetManifest = path.join(DATASET_ROOT, 'manifest.json');
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
  return {
    protocol: 'OMEGA-BENCH-2026', condition_id: 'C',
    status: 'static_interop_validation_and_five_invariant_checked_E04_passes_reference_handlers_elsewhere',
    scenarios: rows.length, repetitions: REPETITIONS, runs: rows.length * REPETITIONS,
    repository_revision: revision,
    adapter_sha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    e04_optimizer_sha256: crypto.createHash('sha256').update(fs.readFileSync(
      path.join(__dirname, 'e04-optimizer.cjs'))).digest('hex'),
    dataset_manifest_sha256: crypto.createHash('sha256').update(fs.readFileSync(datasetManifest)).digest('hex'),
    runtime: { node: process.version, platform: process.platform, arch: process.arch,
      cpu: os.cpus()[0]?.model || null, memory_bytes: os.totalmem() },
    result_file: path.basename(outputPath), external_model_calls: 0
  };
}

async function main() {
  const experiments = Array.from({ length: 12 }, (_, index) => `E${String(index + 1).padStart(2, '0')}`);
  const rows = experiments.flatMap((experiment) => reference.readRows(
    path.join(INPUTS_ROOT, `${experiment}.jsonl`)));
  const outputPath = process.argv[2] || path.join(ROOT, 'results', 'C-gcir-optimized.jsonl');
  const results = [];
  for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
    for (const row of rows) results.push(await timedRow(row, repetition));
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${results.map((item) => JSON.stringify(item)).join('\n')}\n`);
  const traceManifest = traces.writeSidecar(outputPath, 'C');
  fs.writeFileSync(outputPath.replace(/\.jsonl$/i, '.manifest.json'),
    `${JSON.stringify({ ...manifestFor(rows, outputPath), ...traceManifest }, null, 2)}\n`);
  process.stdout.write(`Condition C complete: ${results.length} statically verified runs across ${rows.length} cases.\n`);
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

module.exports = { executeRow, taskInput };
