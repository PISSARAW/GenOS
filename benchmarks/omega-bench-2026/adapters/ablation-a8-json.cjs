'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const reference = require('./json_reference.cjs');
const genos = require('./genos_full.cjs');

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const DATASET_ROOT = process.env.OMEGA_DATASET_ROOT || path.join(ROOT, 'dataset');
const EXPERIMENTS = ['E10', 'E11'];

function inputRows() {
  return EXPERIMENTS.flatMap((experiment) => reference.readRows(
    path.join(DATASET_ROOT, 'public', 'inputs', `${experiment}.jsonl`)));
}

async function runRow(row, repetition, harness) {
  const input = JSON.stringify(row.input);
  const started = performance.now();
  const result = row.experiment_id === 'E10'
    ? await genos.executeMorphogenesis(row, repetition, harness)
    : genos.executePhysiology(row);
  const answer = result.answer;
  return { scenario_id: row.scenario_id, experiment_id: row.experiment_id,
    condition_id: 'A8', repetition, status: result.violations?.length ? 'failed' : 'completed',
    answer, metrics: { ...result.metrics, ablation: 'same GenOS services with typed JSON input',
      gcir_runtime: 'not_used' }, violations: result.violations || [],
    telemetry: { latency_ms: performance.now() - started,
      input_bytes: Buffer.byteLength(input),
      output_bytes: Buffer.byteLength(JSON.stringify(answer)), input_tokens: null,
      output_tokens: null, cost_usd: null } };
}

function manifestFor(rows, outputPath, results) {
  return { protocol: 'OMEGA-BENCH-2026', condition_id: 'A8',
    status: 'scoped_json_control_same_genos_services', scope: EXPERIMENTS,
    scenarios: rows.length, repetitions: 3, runs: results.length,
    services: ['morphogenesis.executeVersionedTransition', 'biome.allocateResources'],
    repository_revision: execFileSync('git', ['rev-parse', 'HEAD'],
      { cwd: REPO, encoding: 'utf8' }).trim(),
    adapter_sha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    genos_adapter_sha256: crypto.createHash('sha256').update(fs.readFileSync(
      path.join(__dirname, 'genos_full.cjs'))).digest('hex'),
    dataset_manifest_sha256: crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(DATASET_ROOT, 'manifest.json'))).digest('hex'),
    runtime: { node: process.version, platform: process.platform, arch: process.arch,
      cpu: os.cpus()[0]?.model || null, memory_bytes: os.totalmem() },
    result_file: path.basename(outputPath), external_model_calls: 0 };
}

async function main() {
  genos.configureAuthority();
  const harness = await genos.createHarness();
  const rows = inputRows();
  const results = [];
  const outputPath = process.argv[2] || path.join(ROOT, 'results', 'ABLATION-A8.jsonl');
  try {
    for (let repetition = 1; repetition <= 3; repetition += 1) {
      for (const row of rows) results.push(await runRow(row, repetition, harness));
    }
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${results.map((row) => JSON.stringify(row)).join('\n')}\n`);
    fs.writeFileSync(outputPath.replace(/\.jsonl$/i, '.manifest.json'),
      `${JSON.stringify(manifestFor(rows, outputPath, results), null, 2)}\n`);
    process.stdout.write(`A8 GenOS JSON control complete: ${results.length} runs.\n`);
  } finally {
    await genos.closeHarness(harness);
  }
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

module.exports = { runRow };
