'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const backendRequire = createRequire(path.join(REPO, 'backend', 'package.json'));
const Ajv2020 = backendRequire('ajv/dist/2020');
const addFormats = backendRequire('ajv-formats');
const omega = require(path.join(REPO, 'backend', 'src', 'services', 'cognitiveOmegaInteropService'));
const schema = JSON.parse(fs.readFileSync(path.join(REPO, 'spec', 'g-cir-omega.schema.json'), 'utf8'));
const inputPath = path.join(ROOT, 'dataset', 'public', 'inputs', 'E03.jsonl');
const outputPath = process.argv[2] || path.join(ROOT, 'results', 'E03-pilot.jsonl');

function readRows(file) {
  return fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
}

function createAjvValidator() {
  const engine = new Ajv2020({ allErrors: true, strict: false });
  addFormats(engine);
  return engine.compile(schema);
}

function validateCandidate({ condition, candidate, validator }) {
  if (condition === 'A') {
    const accepted = validator(candidate);
    return { answer: { accepted }, errors: validator.errors || [] };
  }
  const result = omega.validate(candidate);
  return { answer: { accepted: result.valid }, errors: result.errors };
}

function resultRow({ row, condition, repetition, validator }) {
  const candidate = row.input.candidate;
  const inputBytes = Buffer.byteLength(JSON.stringify(candidate));
  const started = performance.now();
  const evaluated = validateCandidate({ condition, candidate, validator });
  const latency = performance.now() - started;
  return {
    scenario_id: row.scenario_id,
    experiment_id: row.experiment_id,
    condition_id: condition,
    repetition,
    status: 'completed',
    answer: evaluated.answer,
    metrics: { schema_error_count: evaluated.errors.length },
    telemetry: {
      latency_ms: latency,
      input_bytes: inputBytes,
      output_bytes: Buffer.byteLength(JSON.stringify(evaluated.answer)),
      input_tokens: null,
      output_tokens: null,
      cost_usd: null
    }
  };
}

function warmUp(rows, validator) {
  for (const row of rows.slice(0, 10)) {
    for (const condition of ['A', 'B']) validateCandidate({ condition, candidate: row.input.candidate, validator });
  }
}

function runManifest(outputPath, rows) {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' }).trim().length > 0;
  const dataManifest = fs.readFileSync(path.join(ROOT, 'dataset', 'manifest.json'));
  const servicePath = path.join(REPO, 'backend', 'src', 'services', 'cognitiveOmegaInteropService.js');
  return {
    protocol: 'OMEGA-BENCH-2026',
    pilot: 'E03',
    started_at: new Date().toISOString(),
    conditions: ['A', 'B'],
    scenarios: rows.length,
    repetitions: 3,
    run_count: rows.length * 2 * 3,
    dataset_manifest_sha256: crypto.createHash('sha256').update(dataManifest).digest('hex'),
    omega_service_sha256: crypto.createHash('sha256').update(fs.readFileSync(servicePath)).digest('hex'),
    repository_revision: revision,
    repository_dirty: dirty,
    runtime: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model || null, memory_bytes: os.totalmem() },
    result_file: path.basename(outputPath),
    significance_test: false
  };
}

function main() {
  const rows = readRows(inputPath);
  const validator = createAjvValidator();
  warmUp(rows, validator);
  const output = [];
  for (let repetition = 1; repetition <= 3; repetition += 1) {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const order = (index + repetition) % 2 === 0 ? ['A', 'B'] : ['B', 'A'];
      for (const condition of order) {
        output.push(resultRow({ row, condition, repetition, validator }));
      }
    }
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${output.map((item) => JSON.stringify(item)).join('\n')}\n`);
  const metadata = runManifest(outputPath, rows);
  fs.writeFileSync(outputPath.replace(/\.jsonl$/i, '.manifest.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  process.stdout.write(`E03 pilot complete: ${output.length} paired runs written to ${outputPath}\n`);
}

main();
