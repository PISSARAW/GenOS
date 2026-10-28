'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const { performance } = require('node:perf_hooks');
const reference = require('./json_reference.cjs');
const runtimeModule = require(path.resolve(__dirname, '..', '..', '..', 'backend', 'src', 'services', 'cognitiveOmegaRuntimeService'));

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const DATASET_ROOT = process.env.OMEGA_DATASET_ROOT || path.join(ROOT, 'dataset');
const INPUT_PATH = path.join(DATASET_ROOT, 'public', 'inputs', 'E05.jsonl');
const REPETITIONS = 3;
const backendRequire = createRequire(path.join(REPO, 'backend', 'package.json'));
const { open } = backendRequire('sqlite');
const sqlite3 = backendRequire('sqlite3');

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function runtimeOperation() {
  return [{ id: 'apply', kind: 'CALL', reference: 'e05/apply-events', dependsOn: [],
    arguments: null }];
}

function effectHandler(row, effects, probes) {
  return ({ arguments: input, idempotencyKey }) => {
    probes.handlerInvocations += 1;
    probes.idempotencyKeys.push(idempotencyKey);
    const effectKey = idempotencyKey || `memory:${probes.effectCount + 1}`;
    if (effects.has(effectKey)) return effects.get(effectKey);
    const answer = reference.execute({ ...row, input }, null);
    effects.set(effectKey, answer);
    probes.effectCount += 1;
    if (idempotencyKey && probes.simulateInterruption) {
      probes.simulateInterruption = false;
      throw new Error('simulated_interruption_after_external_effect_commit');
    }
    return answer;
  };
}

function createE05Runtime(input) {
  const { row, journal, effects, probes } = input;
  const runtime = runtimeModule.createRuntime(journal ? { journal } : {});
  runtime.registerTool('e05/apply-events', effectHandler(row, effects, probes), { idempotent: true });
  return runtime;
}

function requestFor(row, repetition) {
  const operations = runtimeOperation();
  operations[0].arguments = row.input;
  return { runId: `a4-${row.scenario_id}-r${repetition}`, operations,
    policy: { call: ['e05/apply-events'] }, allowEmit: true };
}

async function openJournal(filename) {
  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
  return db;
}

async function runControl(row, repetition) {
  const probes = { handlerInvocations: 0, effectCount: 0, idempotencyKeys: [], simulateInterruption: false };
  const effects = new Map();
  const runtime = createE05Runtime({ row, journal: null, effects, probes });
  const result = await runtime.execute(requestFor(row, repetition));
  if (result.status !== 'emitted') throw new Error(`control_runtime_${result.reason || result.status}`);
  return { answer: result.values.apply, probes };
}

async function runNative(input) {
  const { row, repetition, dbPath } = input;
  const probes = { handlerInvocations: 0, effectCount: 0, idempotencyKeys: [], simulateInterruption: true };
  const effects = new Map();
  const request = requestFor(row, repetition);
  let db = await openJournal(dbPath);
  const first = await createE05Runtime({ row, journal: db, effects, probes }).execute(request);
  if (first.reason !== 'operation_failed') throw new Error(`interruption_not_observed:${row.scenario_id}`);
  await db.close();

  db = await openJournal(dbPath);
  const recovered = await createE05Runtime({ row, journal: db, effects, probes }).execute(request);
  if (recovered.status !== 'emitted') throw new Error(`recovery_${recovered.reason || recovered.status}`);
  const answer = recovered.values.apply;
  await db.close();

  db = await openJournal(dbPath);
  const replayed = await createE05Runtime({ row, journal: db, effects, probes }).execute(request);
  await db.close();
  const replayVerified = replayed.status === 'emitted'
    && isDeepStrictEqual(answer, replayed.values.apply)
    && probes.effectCount === 1
    && probes.idempotencyKeys.every((key) => key === `gcir:${request.runId}:apply`);
  if (!replayVerified) throw new Error(`native_replay_mismatch:${row.scenario_id}`);
  return { answer, probes, replayVerified };
}

function resultRow(input) {
  const { row, repetition, condition, answer, probes, elapsed, replayVerified, pairedEqual } = input;
  return { scenario_id: row.scenario_id, experiment_id: 'E05', condition_id: condition,
    repetition, status: 'completed', answer,
    metrics: { runtime_journal: condition === 'A4_JOURNAL_NATIVE' ? 'sqlite_native' : 'disabled',
      interruption_recovered: condition === 'A4_JOURNAL_NATIVE', replay_verified: replayVerified,
      paired_answers_equal: pairedEqual, handler_invocations: probes.handlerInvocations,
      observable_effect_count: probes.effectCount, idempotency_keys: probes.idempotencyKeys },
    telemetry: { latency_ms: elapsed, input_bytes: Buffer.byteLength(JSON.stringify(row.input)),
      output_bytes: Buffer.byteLength(JSON.stringify(answer)), input_tokens: null,
      output_tokens: null, cost_usd: null } };
}

function manifestFor(input) {
  const { condition, outputPath, results, dbPath } = input;
  const datasetManifest = path.join(DATASET_ROOT, 'manifest.json');
  return { protocol: 'OMEGA-BENCH-2026', condition_id: condition,
    status: 'public_gcir_native_sqlite_journal_recovery_idempotency_E05', scope: ['E05'],
    scenarios: results.length / REPETITIONS, repetitions: REPETITIONS, runs: results.length,
    protocol_note: 'Both paired arms run the same G-CIR CALL operation and E05 handler. The native arm persists the operation intent/result in the runtime SQLite journal, closes/reopens SQLite after a simulated post-effect interruption, retries with the same idempotencyKey, then reopens and replays the completed result.',
    journal_file: condition === 'A4_JOURNAL_NATIVE' ? path.basename(dbPath) : null,
    journal_db_sha256: condition === 'A4_JOURNAL_NATIVE' ? hash(fs.readFileSync(dbPath)) : null,
    repository_revision: execFileSync('git', ['rev-parse', 'HEAD'],
      { cwd: REPO, encoding: 'utf8' }).trim(),
    adapter_sha256: hash(fs.readFileSync(__filename)),
    runtime_service_sha256: hash(fs.readFileSync(path.join(REPO,
      'backend', 'src', 'services', 'cognitiveOmegaRuntimeService.js'))),
    journal_service_sha256: hash(fs.readFileSync(path.join(REPO,
      'backend', 'src', 'services', 'cognitiveOmegaExecutionJournal.js'))),
    dataset_manifest_sha256: hash(fs.readFileSync(datasetManifest)),
    runtime: { node: process.version, platform: process.platform, arch: process.arch,
      cpu: os.cpus()[0]?.model || null, memory_bytes: os.totalmem() },
    result_file: path.basename(outputPath), external_model_calls: 0 };
}

function writeResults(results, input) {
  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
  fs.writeFileSync(input.outputPath, `${results.map((row) => JSON.stringify(row)).join('\n')}\n`);
  fs.writeFileSync(input.outputPath.replace(/\.jsonl$/i, '.manifest.json'),
    `${JSON.stringify(manifestFor({ ...input, results }), null, 2)}\n`);
}

async function runPair(row, repetition, dbPath) {
  const started = performance.now();
  const control = await runControl(row, repetition);
  const controlElapsed = performance.now() - started;
  const nativeStarted = performance.now();
  const native = await runNative({ row, repetition, dbPath });
  const nativeElapsed = performance.now() - nativeStarted;
  const pairedEqual = isDeepStrictEqual(control.answer, native.answer);
  if (!pairedEqual) throw new Error(`paired_answer_mismatch:${row.scenario_id}`);
  return [
    resultRow({ row, repetition, condition: 'A4_CONTROL', answer: control.answer,
      probes: control.probes, elapsed: controlElapsed, pairedEqual }),
    resultRow({ row, repetition, condition: 'A4_JOURNAL_NATIVE', answer: native.answer,
      probes: native.probes, elapsed: nativeElapsed, replayVerified: native.replayVerified, pairedEqual })
  ];
}

async function main() {
  const rows = reference.readRows(INPUT_PATH).slice(0, 100);
  const resultsDir = path.join(ROOT, 'results');
  const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dbPath = path.join(resultsDir, `A4-E05-native-${runStamp}.sqlite`);
  const controlPath = path.join(resultsDir, 'A4-E05-control.jsonl');
  const nativePath = path.join(resultsDir, 'A4-E05-journal-native.jsonl');
  const output = { control: [], native: [] };
  fs.mkdirSync(resultsDir, { recursive: true });
  for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
    for (const row of rows) {
      const pair = await runPair(row, repetition, dbPath);
      output.control.push(pair[0]);
      output.native.push(pair[1]);
    }
  }
  writeResults(output.control, { condition: 'A4_CONTROL', outputPath: controlPath, dbPath });
  writeResults(output.native, { condition: 'A4_JOURNAL_NATIVE', outputPath: nativePath, dbPath });
  process.stdout.write(`A4 native G-CIR E05 complete: ${rows.length * REPETITIONS} paired cases, SQLite reopen/recovery/replay verified.\n`);
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

module.exports = { effectHandler, requestFor, resultRow, runControl, runNative };
