'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const { performance } = require('node:perf_hooks');
const reference = require('./json_reference.cjs');
const gcir = require('./gcir_optimized.cjs');

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const DATASET_ROOT = process.env.OMEGA_DATASET_ROOT || path.join(ROOT, 'dataset');
const INPUT_PATH = path.join(DATASET_ROOT, 'public', 'inputs', 'E05.jsonl');
const REPETITIONS = 3;

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function journalLine(row, repetition, answer) {
  const canonicalInput = JSON.stringify(row.input);
  const canonicalOutput = JSON.stringify(answer);
  const record = { schema: 'omega-a4-harness-journal-v1', scenario_id: row.scenario_id,
    repetition, input: row.input, input_sha256: hash(canonicalInput), answer,
    answer_sha256: hash(canonicalOutput) };
  return `${JSON.stringify(record)}\n`;
}

function appendDurably(journalPath, line) {
  const fd = fs.openSync(journalPath, 'a');
  try {
    fs.writeSync(fd, line, null, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function findJournalRecord(journalPath, row, repetition) {
  const lines = fs.readFileSync(journalPath, 'utf8').trimEnd().split('\n');
  const matching = lines.map((line) => JSON.parse(line)).filter((record) =>
    record.scenario_id === row.scenario_id && record.repetition === repetition);
  if (matching.length !== 1) throw new Error(`journal_record_count:${row.scenario_id}:${repetition}`);
  return matching[0];
}

async function runControl(row, repetition) {
  const started = performance.now();
  const output = await gcir.executeRow(row);
  const elapsed = performance.now() - started;
  return makeResult({ row, repetition, answer: output.answer, condition: 'A4_CONTROL', elapsed,
    metrics: { harness_journal: 'disabled', replay_runs: 0, journal_bytes: 0,
      journal_fsync_calls: 0 } });
}

async function runJournalled(row, repetition, journalPath) {
  const started = performance.now();
  const output = await gcir.executeRow(row);
  const answer = output.answer;
  const line = journalLine(row, repetition, answer);
  const writeStarted = performance.now();
  appendDurably(journalPath, line);
  const writeMs = performance.now() - writeStarted;
  const replayStarted = performance.now();
  const record = findJournalRecord(journalPath, row, repetition);
  if (hash(JSON.stringify(record.input)) !== record.input_sha256
    || hash(JSON.stringify(record.answer)) !== record.answer_sha256) {
    throw new Error(`journal_hash_mismatch:${row.scenario_id}:${repetition}`);
  }
  const replayOutput = await gcir.executeRow({ ...row, input: record.input });
  const replayAnswer = replayOutput.answer;
  const replayMs = performance.now() - replayStarted;
  const replayVerified = isDeepStrictEqual(answer, replayAnswer)
    && isDeepStrictEqual(record.answer, replayAnswer);
  if (!replayVerified) throw new Error(`journal_replay_mismatch:${row.scenario_id}:${repetition}`);
  return makeResult({ row, repetition, answer: replayAnswer, condition: 'A4_JOURNAL_REPLAY',
    elapsed: performance.now() - started, metrics: {
      harness_journal: 'append_fsync_and_reexecute_from_durable_input',
      replay_verified: replayVerified, replay_runs: 1, journal_write_ms: writeMs,
      journal_replay_ms: replayMs, journal_line_bytes: Buffer.byteLength(line),
      journal_fsync_calls: 1
    } });
}

function makeResult(input) {
  const { row, repetition, answer, condition, elapsed, metrics } = input;
  return { scenario_id: row.scenario_id, experiment_id: 'E05', condition_id: condition,
    repetition, status: 'completed', answer, metrics,
    telemetry: { latency_ms: elapsed, input_bytes: Buffer.byteLength(JSON.stringify(row.input)),
      output_bytes: Buffer.byteLength(JSON.stringify(answer)), input_tokens: null,
      output_tokens: null, cost_usd: null } };
}

function manifestFor(input) {
  const { condition, outputPath, journalPath, results } = input;
  const datasetManifest = path.join(DATASET_ROOT, 'manifest.json');
  return { protocol: 'OMEGA-BENCH-2026', condition_id: condition,
    status: 'public_harness_level_journal_replay_control_not_gcir_native', scope: ['E05'],
    scenarios: 100, repetitions: REPETITIONS, runs: results.length,
    protocol_note: 'Both arms execute the same C G-CIR E05 adapter; the journal arm appends input/output, fsyncs, rereads the record, and reexecutes from the journaled input.',
    journal_file: journalPath ? path.basename(journalPath) : null,
    repository_revision: execFileSync('git', ['rev-parse', 'HEAD'],
      { cwd: REPO, encoding: 'utf8' }).trim(),
    adapter_sha256: hash(fs.readFileSync(__filename)),
    gcir_adapter_sha256: hash(fs.readFileSync(path.join(__dirname, 'gcir_optimized.cjs'))),
    dataset_manifest_sha256: hash(fs.readFileSync(datasetManifest)),
    runtime: { node: process.version, platform: process.platform, arch: process.arch,
      cpu: os.cpus()[0]?.model || null, memory_bytes: os.totalmem() },
    result_file: path.basename(outputPath), external_model_calls: 0 };
}

function writeResults(results, input) {
  const { condition, outputPath, journalPath } = input;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${results.map((row) => JSON.stringify(row)).join('\n')}\n`);
  fs.writeFileSync(outputPath.replace(/\.jsonl$/i, '.manifest.json'),
    `${JSON.stringify(manifestFor({ condition, outputPath, journalPath, results }), null, 2)}\n`);
}

async function runArm(rows, input) {
  const { condition, outputPath, journalPath } = input;
  const results = [];
  for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
    for (const row of rows) {
      const result = condition === 'A4_CONTROL'
        ? await runControl(row, repetition)
        : await runJournalled(row, repetition, journalPath);
      results.push(result);
    }
  }
  writeResults(results, { condition, outputPath, journalPath });
}

async function main() {
  const referenceRows = reference.readRows(INPUT_PATH);
  const rows = referenceRows.slice(0, 100);
  const resultsDir = path.join(ROOT, 'results');
  const journalPath = path.join(resultsDir, 'A4-E05-journal.jsonl');
  const controlPath = path.join(resultsDir, 'A4-E05-control.jsonl');
  const journalledPath = path.join(resultsDir, 'A4-E05-journal-replay.jsonl');
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(journalPath, '');
  await runArm(rows, { condition: 'A4_CONTROL', outputPath: controlPath, journalPath: null });
  await runArm(rows, { condition: 'A4_JOURNAL_REPLAY', outputPath: journalledPath, journalPath });
  process.stdout.write(`A4 harness-level E05 control complete: ${rows.length * REPETITIONS} paired scenarios per arm.\n`);
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

module.exports = { appendDurably, findJournalRecord, journalLine };
