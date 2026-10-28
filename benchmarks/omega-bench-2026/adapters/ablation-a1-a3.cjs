'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const reference = require('./json_reference.cjs');
const compiler = require(path.resolve(__dirname, '..', '..', '..', 'backend',
  'src', 'services', 'cognitiveOmegaCompiler'));
const interop = require(path.resolve(__dirname, '..', '..', '..', 'backend',
  'src', 'services', 'cognitiveOmegaInteropService'));
const { createRuntime } = require(path.resolve(__dirname, '..', '..', '..', 'backend',
  'src', 'services', 'cognitiveOmegaRuntimeService'));

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const DATASET_ROOT = process.env.OMEGA_DATASET_ROOT || path.join(ROOT, 'dataset');

function foldProgram(input) {
  const program = input.program || [];
  const eligible = program.length > 1 && program.every((operation) => operation.op === 'add'
    && Number.isFinite(operation.value));
  if (!eligible) return { input, before: program.length, after: program.length, applied: false };
  const folded = [{ op: 'add', value: program.reduce((sum, operation) => sum + operation.value, 0) }];
  return { input: { ...input, program: folded }, before: program.length, after: 1, applied: true };
}

async function runA1(row, repetition, optimized) {
  const started = performance.now();
  const plan = optimized ? foldProgram(row.input)
    : { input: row.input, before: (row.input.program || []).length,
      after: (row.input.program || []).length, applied: false };
  const operations = [
    { id: 'read', kind: 'READ', reference: 'bench/input', dependsOn: [], state: 'open' },
    { id: 'select', kind: 'SELECT', reference: 'bench/input', dependsOn: ['read'], state: 'open' },
    { id: 'call', kind: 'CALL', reference: 'bench/E04', dependsOn: ['select'], state: 'open' }
  ];
  const envelope = { schema: interop.SCHEMA, version: 1, id: row.scenario_id, operations,
    policy: { read: ['bench/input'], select: ['bench/input'], call: ['bench/E04'] }, payload: plan.input };
  if (!interop.validate(envelope).valid) throw new Error('a1_envelope_invalid');
  const compiled = compiler.compile({ operations, targets: ['call'], model: 'a1-optimizer-ablation' });
  if (compiled.status !== 'ready') throw new Error(`a1_compile_${compiled.status}`);
  const runtime = createRuntime();
  runtime.registerReader('bench/input', async () => plan.input);
  runtime.registerTool('bench/E04', async ({ input }) => reference.execute({ ...row, input }, null));
  const executed = await runtime.execute({ operations: compiled.slice.nodes,
    policy: envelope.policy, allowEmit: true });
  if (executed.status !== 'emitted') throw new Error(`a1_runtime_${executed.reason}`);
  const answer = executed.values.call;
  return resultRow({ row, repetition, condition: optimized ? 'A1-on' : 'A1-off', answer,
    metrics: { optimizer: 'adjacent_addition_fold', applied: plan.applied,
      operation_count_before: plan.before, operation_count_after: plan.after }, started });
}

function envelopeFor(row) {
  return row.input.candidate;
}

function looseStructuralCheck(candidate) {
  return Boolean(candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    && candidate.schema === interop.SCHEMA && candidate.version === 1
    && typeof candidate.id === 'string' && Array.isArray(candidate.operations)
    && candidate.policy && typeof candidate.policy === 'object' && !Array.isArray(candidate.policy));
}

function runA3(row, repetition, typed) {
  const candidate = envelopeFor(row);
  const started = performance.now();
  const accepted = typed ? interop.validate(candidate).valid : looseStructuralCheck(candidate);
  return resultRow({ row, repetition, condition: typed ? 'A3-on' : 'A3-off', answer: { accepted },
    metrics: { typing: typed ? 'schema+enum+field-types' : 'container-shape-only',
      schema_validation: typed ? 'enabled' : 'disabled', json_parse: 'enabled' }, started });
}

function resultRow(input) {
  const { row, repetition, condition, answer, metrics, started } = input;
  return { scenario_id: row.scenario_id, experiment_id: row.experiment_id,
    condition_id: condition, repetition, status: 'completed', answer, metrics,
    telemetry: { latency_ms: performance.now() - started,
      input_bytes: Buffer.byteLength(JSON.stringify(row.input)),
      output_bytes: Buffer.byteLength(JSON.stringify(answer)), input_tokens: null,
      output_tokens: null, cost_usd: null } };
}

function manifest(input) {
  const { condition, experiment, rows, results, outputPath, feature } = input;
  const datasetManifest = path.join(DATASET_ROOT, 'manifest.json');
  return { protocol: 'OMEGA-BENCH-2026', condition_id: condition,
    status: 'scoped_public_development_ablation', scope: [experiment],
    scenarios: rows.length, repetitions: 3, runs: results.length, feature,
    repository_revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(),
    adapter_sha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    implementation_sha256: crypto.createHash('sha256').update(fs.readFileSync(
      path.join(REPO, 'backend/src/services/cognitiveOmegaInteropService.js'))).digest('hex'),
    dataset_manifest_sha256: crypto.createHash('sha256').update(fs.readFileSync(datasetManifest)).digest('hex'),
    runtime: { node: process.version, platform: process.platform, arch: process.arch,
      cpu: os.cpus()[0]?.model || null, memory_bytes: os.totalmem() },
    result_file: path.basename(outputPath), external_model_calls: 0 };
}

function saveArm(input) {
  const { condition, experiment, rows, results, feature } = input;
  const outputPath = path.join(ROOT, 'results', `${condition}.jsonl`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${results.map((item) => JSON.stringify(item)).join('\n')}\n`);
  fs.writeFileSync(outputPath.replace(/\.jsonl$/i, '.manifest.json'),
    `${JSON.stringify(manifest({ condition, experiment, rows, results, outputPath, feature }), null, 2)}\n`);
}

async function runArms(input) {
  const { rows, condition, runCase, feature } = input;
  for (const enabled of [false, true]) {
    const arm = condition.replace('{arm}', enabled ? 'on' : 'off');
    const results = [];
    for (let repetition = 1; repetition <= 3; repetition += 1) {
      for (const row of rows) results.push(await runCase(row, repetition, enabled));
    }
    saveArm({ condition: arm, experiment: rows[0].experiment_id, rows, results, feature });
    process.stdout.write(`${arm}: ${results.length} runs.\n`);
  }
}

function readExperiment(experiment) {
  return reference.readRows(path.join(DATASET_ROOT, 'public', 'inputs', `${experiment}.jsonl`));
}

async function main() {
  await runArms({ rows: readExperiment('E04'), condition: 'A1-{arm}', runCase: runA1,
    feature: 'adjacent addition fold enabled versus disabled' });
  await runArms({ rows: readExperiment('E03'), condition: 'A3-{arm}', runCase: runA3,
    feature: 'strict schema typing versus container-only structural validation' });
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

module.exports = { foldProgram, looseStructuralCheck, runA1, runA3 };
