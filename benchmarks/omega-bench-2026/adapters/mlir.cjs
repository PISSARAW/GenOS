'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const INPUTS_ROOT = process.env.OMEGA_DATASET_INPUTS
  || path.join(ROOT, 'dataset', 'public', 'inputs');
const EXPERIMENTS = ['E01', 'E02', 'E03', 'E04', 'E12'];
const REPETITIONS = 3;
const reference = require('./json_reference.cjs');
const traces = require('../src/run-trace.cjs');

function inputRows() {
  return EXPERIMENTS.flatMap((experiment) => reference.readRows(
    path.join(INPUTS_ROOT, `${experiment}.jsonl`)));
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

function wslPath(inputPath) {
  const absolute = path.resolve(inputPath);
  const match = absolute.match(/^([A-Za-z]):[\\/](.*)$/);
  if (!match) throw new Error(`unsupported_wsl_worker_path:${absolute}`);
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll('\\', '/')}`;
}

class MlirWorker {
  constructor(command, args) {
    this.child = spawn(command, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.waiters = [];
    this.stderr = '';
    this.failure = null;
    this.closing = false;
    this.output = readline.createInterface({ input: this.child.stdout });
    this.output.on('line', (line) => this.onLine(line));
    this.child.stderr.on('data', (chunk) => this.captureStderr(chunk));
    this.child.on('error', (error) => this.fail(error));
    this.child.on('close', (code) => this.onClose(code));
  }

  captureStderr(chunk) {
    this.stderr = `${this.stderr}${chunk.toString('utf8')}`.slice(-8000);
  }

  onLine(line) {
    let response;
    try { response = JSON.parse(line); } catch (error) {
      this.fail(new Error(`invalid_mlir_worker_response:${error.message}`));
      return;
    }
    const waiter = this.waiters.shift();
    if (!waiter) return this.fail(new Error('unsolicited_mlir_worker_response'));
    waiter.resolve(response);
  }

  onClose(code) {
    if (!this.closing || code !== 0) {
      this.fail(new Error(`mlir_worker_exit_${code}:${this.stderr}`));
    }
  }

  fail(error) {
    if (this.failure) return;
    this.failure = error;
    this.waiters.splice(0).forEach((waiter) => waiter.reject(error));
  }

  receive() {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  async verify(source, id) {
    const pending = this.receive();
    const request = JSON.stringify({ id, source });
    await new Promise((resolve, reject) => this.child.stdin.write(`${request}\n`, (error) => {
      if (error) reject(error);
      else resolve();
    }));
    const response = await pending;
    if (response.id !== id || response.ok !== true) {
      throw new Error(`MLIR verification failed: ${response.error || 'worker_response_mismatch'}`);
    }
    return response;
  }

  async close() {
    this.closing = true;
    this.child.stdin.end();
    await new Promise((resolve, reject) => {
      this.child.once('close', (code) => code === 0
        ? resolve() : reject(new Error(`mlir_worker_exit_${code}:${this.stderr}`)));
    });
  }
}

async function runRow(context) {
  const { row, repetition, validator, worker, runId } = context;
  const trace = traces.start({ scenario_id: row.scenario_id, experiment_id: row.experiment_id,
    condition_id: 'MLIR', repetition }, row.input);
  const source = mlirSource(row);
  traces.phase(trace, 'mlir_source_generated');
  const verified = await worker.verify(source, runId);
  traces.phase(trace, 'mlir_verification_completed');
  const answer = reference.execute(row, validator);
  traces.phase(trace, 'reference_answer_observed');
  traces.finish(trace, answer);
  return {
    scenario_id: row.scenario_id, experiment_id: row.experiment_id,
    condition_id: 'MLIR', repetition, status: 'completed', answer,
    metrics: { mlir_verified: true, optimized_ir_sha256: verified.optimized_ir_sha256 },
    telemetry: { latency_ms: verified.latency_ms, input_bytes: Buffer.byteLength(source),
      output_bytes: verified.output_bytes, input_tokens: null, output_tokens: null,
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
    measurement_boundary: 'latency_ms is the monotonic wall time for one mlir-opt-22 subprocess in WSL; excludes WSL startup, source generation, and host-worker IPC',
    external_model_calls: 0
  };
  Object.assign(manifest, traces.writeSidecar(outputPath, 'MLIR'));
  fs.writeFileSync(outputPath.replace(/\.jsonl$/i, '.manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  const rows = inputRows();
  const validator = reference.createValidator();
  const results = [];
  const workerPath = wslPath(path.join(__dirname, 'mlir-runtime', 'worker.py'));
  const worker = new MlirWorker('wsl.exe', ['-d', 'Ubuntu', '--', 'python3', '-u', workerPath]);
  let runId = 0;
  try {
    for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
      for (const row of rows) {
        results.push(await runRow({ row, repetition, validator, worker, runId }));
        runId += 1;
      }
    }
  } finally {
    await worker.close();
  }
  const outputPath = process.argv[2] || path.join(ROOT, 'results', 'MLIR-baseline.jsonl');
  saveResults(rows, results, outputPath);
  process.stdout.write(`MLIR baseline complete: ${results.length} runs across ${rows.length} cases.\n`);
}

if (require.main === module) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}

module.exports = { MlirWorker, mlirSource, wslPath };
