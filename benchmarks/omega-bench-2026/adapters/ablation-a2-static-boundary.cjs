'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const traces = require('../src/run-trace.cjs');
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

function executionGraph(candidate) {
  return candidate.operations.map((operation) => ({ ...operation,
    id: operation.id.replace(/[^a-z0-9_]/g, '_').replace(/^[^a-z]/, 'op_') }));
}

async function runtimeFor(candidate, operations) {
  let handlerCalls = 0;
  const runtime = createRuntime();
  for (const [kind, references] of Object.entries(candidate.policy || {})) {
    for (const reference of references) {
      if (kind === 'read') runtime.registerReader(reference, async () => {
        handlerCalls += 1;
        return candidate.payload;
      });
    }
  }
  const started = performance.now();
  const execution = await runtime.execute({ operations, policy: candidate.policy, allowEmit: true });
  return { execution, handlerCalls, runtimeMs: performance.now() - started };
}

function compilerStage(candidate, operations, enabled) {
  const compileStarted = performance.now();
  const validation = enabled ? interop.validate(candidate) : null;
  if (enabled && !validation.valid) {
    return { compiled: null, compileMs: performance.now() - compileStarted, phase: 'static_schema',
      reason: validation.errors.join(',') };
  }
  const compiled = enabled ? compiler.compile({ operations,
    targets: operations.map((operation) => operation.id), model: 'a2-static-ablation' }) : null;
  const compileMs = performance.now() - compileStarted;
  const phase = enabled && compiled.status !== 'ready' ? 'compiler' : null;
  return { compiled, compileMs, phase, reason: compiled?.reason || null };
}

async function runtimeStage(input) {
  const { candidate, operations, stage } = input;
  if (stage.phase) return { execution: { status: 'blocked', reason: stage.reason },
    handlerCalls: 0, runtimeMs: 0 };
  const runtimeOperations = stage.compiled?.slice.nodes || operations;
  return runtimeFor(candidate, runtimeOperations);
}

function rejectionLayer(stage, outcome) {
  return stage.phase || (outcome.execution.status === 'blocked' ? 'runtime' : null);
}

async function runRow(row, repetition, compileEnabled) {
  const condition = compileEnabled ? 'A2-on' : 'A2-off';
  const trace = traces.start({ scenario_id: row.scenario_id, experiment_id: 'E03',
    condition_id: condition, repetition }, row.input);
  const candidate = row.input.candidate;
  const operations = executionGraph(candidate);
  const stage = compilerStage(candidate, operations, compileEnabled);
  traces.phase(trace, 'validation_and_compile_stage_completed');
  const outcome = await runtimeStage({ candidate, operations, stage });
  traces.phase(trace, 'runtime_stage_evaluated');
  const accepted = outcome.execution.status === 'emitted';
  const answer = { accepted,
    mission_execution: reference.executeMissionWorkload(row.input.mission_workload) };
  traces.finish(trace, answer);
  return { scenario_id: row.scenario_id, experiment_id: 'E03',
    condition_id: compileEnabled ? 'A2-on' : 'A2-off', repetition,
    status: 'completed', answer,
    metrics: { rejection_layer: rejectionLayer(stage, outcome),
      static_schema_status: compileEnabled ? (stage.phase === 'static_schema' ? 'rejected' : 'valid') : 'bypassed',
      compile_status: stage.compiled?.status || 'bypassed', compile_reason: stage.reason,
      runtime_status: stage.phase ? 'not_called' : outcome.execution.status,
      runtime_reason: stage.phase ? null : outcome.execution.reason || null,
      handler_calls: outcome.handlerCalls, compile_ms: stage.compileMs,
      runtime_ms: outcome.runtimeMs },
    telemetry: { latency_ms: stage.compileMs + outcome.runtimeMs,
      input_bytes: Buffer.byteLength(JSON.stringify(candidate)),
      output_bytes: Buffer.byteLength(JSON.stringify({ accepted })),
      input_tokens: null, output_tokens: null, cost_usd: null } };
}

function writeArm(rows, condition, results) {
  const prefix = process.argv[2] || 'ABLATION';
  const resultsDir = process.env.OMEGA_RESULTS_DIR || path.join(ROOT, 'results');
  const outputPath = path.join(resultsDir, `${prefix}-${condition}.jsonl`);
  const implementation = path.join(REPO, 'backend/src/services/cognitiveOmegaCompiler.js');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${results.map((row) => JSON.stringify(row)).join('\n')}\n`);
  const traceManifest = traces.writeSidecar(outputPath, condition);
  const manifest = { protocol: 'OMEGA-BENCH-2026', condition_id: condition,
    status: 'scoped_public_development_ablation', scope: ['E03'], scenarios: rows.length,
    repetitions: 3, runs: results.length,
    feature: condition === 'A2-on'
      ? 'strict raw-envelope schema verification, compile, then guarded runtime'
      : 'schema/compiler bypass followed by the guarded runtime',
    repository_revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(),
    adapter_sha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    compiler_sha256: crypto.createHash('sha256').update(fs.readFileSync(implementation)).digest('hex'),
    dataset_manifest_sha256: crypto.createHash('sha256').update(fs.readFileSync(
      path.join(DATASET_ROOT, 'manifest.json'))).digest('hex'),
    runtime: { node: process.version, platform: process.platform, arch: process.arch,
      cpu: os.cpus()[0]?.model || null }, result_file: path.basename(outputPath), external_model_calls: 0,
    ...traceManifest };
  fs.writeFileSync(outputPath.replace(/\.jsonl$/i, '.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function runArm(rows, compileEnabled) {
  const condition = compileEnabled ? 'A2-on' : 'A2-off';
  const results = [];
  for (let repetition = 1; repetition <= 3; repetition += 1) {
    for (const row of rows) results.push(await runRow(row, repetition, compileEnabled));
  }
  writeArm(rows, condition, results);
  const blocked = results.filter((row) => row.answer.accepted === false).length;
  process.stdout.write(`${condition}: ${results.length} runs; ${blocked} candidates rejected.\n`);
}

async function main() {
  const rows = reference.readRows(path.join(DATASET_ROOT, 'public', 'inputs', 'E03.jsonl'));
  await runArm(rows, true);
  await runArm(rows, false);
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

module.exports = { executionGraph };
