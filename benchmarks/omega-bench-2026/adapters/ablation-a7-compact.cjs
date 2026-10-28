'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const { performance } = require('node:perf_hooks');
const reference = require('./json_reference.cjs');
const traces = require('../src/run-trace.cjs');
const interop = require(path.resolve(__dirname, '..', '..', '..', 'backend',
  'src', 'services', 'cognitiveOmegaInteropService'));

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const DATASET_ROOT = process.env.OMEGA_DATASET_ROOT || path.join(ROOT, 'dataset');

function inputRows() {
  return reference.readRows(path.join(DATASET_ROOT, 'public', 'inputs', 'E02.jsonl'));
}

function envelopeFor(row) {
  return { schema: interop.SCHEMA, version: 1, id: row.scenario_id,
    operations: [{ id: 'read', kind: 'READ', reference: 'bench/input', dependsOn: [], state: 'open' },
      { id: 'call', kind: 'CALL', reference: 'bench/E02', dependsOn: ['read'], state: 'open' }],
    policy: { read: ['bench/input'], call: ['bench/E02'] }, payload: row.input };
}

function runRow(row, repetition) {
  const trace = traces.start({ scenario_id: row.scenario_id, experiment_id: 'E02',
    condition_id: 'A7', repetition }, row.input);
  const source = envelopeFor(row);
  const jsonBytes = Buffer.byteLength(JSON.stringify(source));
  const started = performance.now();
  const frame = interop.encode(source);
  const restored = interop.decode(frame);
  const latency = performance.now() - started;
  const answer = reference.execute({ ...row, input: restored.payload }, null);
  const referenceAnswer = reference.execute(row, null);
  const verified = isDeepStrictEqual(answer, referenceAnswer);
  if (!verified) throw new Error(`compact_roundtrip_mismatch:${row.scenario_id}`);
  traces.phase(trace, 'compact_encode_decode_oracle_check_completed');
  traces.finish(trace, answer);
  return { scenario_id: row.scenario_id, experiment_id: 'E02', condition_id: 'A7',
    repetition, status: 'completed', answer,
    metrics: { compact_roundtrip_verified: verified, json_bytes: jsonBytes,
      compact_bytes: frame.byteLength, byte_saving_ratio: 1 - frame.byteLength / jsonBytes },
    telemetry: { latency_ms: latency, input_bytes: frame.byteLength,
      output_bytes: Buffer.byteLength(JSON.stringify(answer)), input_tokens: null,
      output_tokens: null, cost_usd: null } };
}

function manifestFor(rows, outputPath, results) {
  return { protocol: 'OMEGA-BENCH-2026', condition_id: 'A7', status: 'public_development_ablation',
    scope: ['E02'], scenarios: rows.length, repetitions: 3, runs: results.length,
    feature: 'G-CIR Ω MessagePack interop encode/decode',
    repository_revision: execFileSync('git', ['rev-parse', 'HEAD'],
      { cwd: REPO, encoding: 'utf8' }).trim(),
    adapter_sha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    implementation_sha256: crypto.createHash('sha256').update(fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'backend', 'src', 'services',
        'cognitiveOmegaInteropService.js'))).digest('hex'),
    dataset_manifest_sha256: crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(DATASET_ROOT, 'manifest.json'))).digest('hex'),
    runtime: { node: process.version, platform: process.platform, arch: process.arch,
      cpu: os.cpus()[0]?.model || null, memory_bytes: os.totalmem() },
    result_file: path.basename(outputPath), external_model_calls: 0 };
}

function writeResults(rows, results, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${results.map((row) => JSON.stringify(row)).join('\n')}\n`);
  const traceManifest = traces.writeSidecar(outputPath, 'A7');
  fs.writeFileSync(outputPath.replace(/\.jsonl$/i, '.manifest.json'),
    `${JSON.stringify({ ...manifestFor(rows, outputPath, results), ...traceManifest }, null, 2)}\n`);
}

function main() {
  const rows = inputRows();
  const results = [];
  for (let repetition = 1; repetition <= 3; repetition += 1) {
    for (const row of rows) results.push(runRow(row, repetition));
  }
  const outputPath = process.argv[2] || path.join(ROOT, 'results', 'ABLATION-A7.jsonl');
  writeResults(rows, results, outputPath);
  process.stdout.write(`A7 compact-encoding ablation complete: ${results.length} runs.\n`);
}

if (require.main === module) main();

module.exports = { envelopeFor, runRow };
