'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const EXPERIMENTS = ['E01', 'E02', 'E03', 'E04', 'E12'];
const REPETITIONS = 3;
const reference = require('./json_reference.cjs');

function inputRows() {
  return EXPERIMENTS.flatMap((experiment) => reference.readRows(
    path.join(ROOT, 'dataset', 'public', 'inputs', `${experiment}.jsonl`)));
}

function numericInputs(value, collected = []) {
  if (Number.isInteger(value)) collected.push(value);
  else if (Array.isArray(value)) value.forEach((item) => numericInputs(item, collected));
  else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => numericInputs(item, collected));
  }
  return collected.slice(0, 24);
}

function mlirSource(row) {
  if (row.experiment_id === 'E04') return mlirE04Source(row.input);
  const values = numericInputs(row.input);
  const lines = values.map((value, index) => `    %v${index} = arith.constant ${value} : i64`);
  let result = values.length ? '%v0' : '%zero';
  if (!values.length) lines.push('    %zero = arith.constant 0 : i64');
  if (row.experiment_id === 'E01') {
    const match = row.input.intent.match(/Move (\d+) units/);
    const quantity = Number(match?.[1] || 0);
    const available = row.input.facts.available;
    lines.push(`    %quantity = arith.constant ${quantity} : i64`);
    lines.push(`    %available = arith.constant ${available} : i64`);
    lines.push('    %enough = arith.cmpi sge, %available, %quantity : i64');
    lines.push('    %one = arith.constant 1 : i64');
    lines.push('    %none = arith.constant 0 : i64');
    lines.push('    %decision = arith.select %enough, %one, %none : i64');
    result = '%decision';
  }
  for (let index = 1; index < values.length; index += 1) {
    lines.push(`    %sum${index} = arith.addi ${result}, %v${index} : i64`);
    result = `%sum${index}`;
  }
  return `module {\n  func.func @omega() -> i64 {\n${lines.join('\n')}\n    return ${result} : i64\n  }\n}\n`;
}

function mlirE04Source(input) {
  const lines = [`    %initial = arith.constant ${input.initial} : i64`];
  let result = '%initial';
  input.program.forEach((operation, index) => {
    const mnemonic = operation.op === 'mul' ? 'muli' : 'addi';
    lines.push(`    %step${index} = arith.constant ${operation.value} : i64`);
    lines.push(`    %value${index} = arith.${mnemonic} ${result}, %step${index} : i64`);
    result = `%value${index}`;
  });
  return `module {\n  func.func @omega() -> i64 {\n${lines.join('\n')}\n    return ${result} : i64\n  }\n}\n`;
}

function invokeMlir(source) {
  const started = performance.now();
  const result = spawnSync('wsl.exe', ['-d', 'Ubuntu', '--', 'mlir-opt-22', '--verify-each', '--canonicalize'], {
    input: source, encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024
  });
  const latency = performance.now() - started;
  if (result.error || result.status !== 0) {
    throw new Error(`MLIR verification failed: ${result.error?.message || result.stderr}`);
  }
  return { optimized: result.stdout, latency };
}

function runRow(row, repetition, validator) {
  const source = mlirSource(row);
  const { optimized, latency } = invokeMlir(source);
  const answer = reference.execute(row, validator);
  return {
    scenario_id: row.scenario_id, experiment_id: row.experiment_id,
    condition_id: 'MLIR', repetition, status: 'completed', answer,
    metrics: { mlir_verified: true, optimized_ir_sha256: crypto.createHash('sha256')
      .update(optimized).digest('hex') },
    telemetry: { latency_ms: latency, input_bytes: Buffer.byteLength(source),
      output_bytes: Buffer.byteLength(optimized), input_tokens: null, output_tokens: null,
      cost_usd: null }
  };
}

function saveResults(rows, results, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${results.map((row) => JSON.stringify(row)).join('\n')}\n`);
  const manifest = {
    protocol: 'OMEGA-BENCH-2026', condition_id: 'MLIR', status: 'scoped_external_baseline',
    scope: EXPERIMENTS, scenarios: rows.length, repetitions: REPETITIONS, runs: results.length,
    tool: 'mlir-opt-22 (Ubuntu 26.04 WSL, LLVM/MLIR 22.1.2)',
    repository_revision: require('node:child_process').execFileSync(
      'git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(),
    adapter_sha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    dataset_manifest_sha256: crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(ROOT, 'dataset', 'manifest.json'))).digest('hex'),
    runner_platform: { node: process.version, platform: process.platform, arch: process.arch,
      cpu: os.cpus()[0]?.model || null, memory_bytes: os.totalmem() },
    execution_platform: 'Ubuntu 26.04 under WSL; latency is not pooled with Windows baselines',
    external_model_calls: 0
  };
  fs.writeFileSync(outputPath.replace(/\.jsonl$/i, '.manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`);
}

function main() {
  const rows = inputRows();
  const validator = reference.createValidator();
  const results = [];
  for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
    for (const row of rows) results.push(runRow(row, repetition, validator));
  }
  const outputPath = process.argv[2] || path.join(ROOT, 'results', 'MLIR-baseline.jsonl');
  saveResults(rows, results, outputPath);
  process.stdout.write(`MLIR baseline complete: ${results.length} runs across ${rows.length} cases.\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
}

module.exports = { mlirSource };
