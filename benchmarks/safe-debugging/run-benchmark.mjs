import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const benchmarkDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(benchmarkDir, '../..');
const fixtureDir = path.join(repoRoot, 'examples/safe-debugging-demo/fixture');
const mutationDir = path.join(repoRoot, 'examples/safe-debugging-demo/mutations');
const demoReport = path.join(repoRoot, 'examples/safe-debugging-demo/artifacts/latest.json');
const scratchRoot = path.join(repoRoot, '.genos/benchmarks/safe-debugging');
const resultDir = path.join(benchmarkDir, 'results');
const repetitions = Number.parseInt(process.argv[2] ?? '10', 10);

if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) {
  throw new Error('Repetitions must be an integer between 1 and 100');
}

function command(commandName, args, options = {}) {
  return spawnSync(commandName, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  });
}

function version(commandName, args) {
  const result = command(commandName, args);
  return result.status === 0 ? result.stdout.trim() : 'unavailable';
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

function summarize(samples, successSelector, durationSelector) {
  const durations = samples.map(durationSelector);
  const successes = samples.filter(successSelector).length;
  return {
    runs: samples.length,
    successes,
    success_rate: successes / samples.length,
    duration_ms: {
      min: Math.min(...durations),
      median: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      max: Math.max(...durations),
    },
  };
}

function executeCandidate(runDir, candidate) {
  rmSync(runDir, { recursive: true, force: true });
  cpSync(fixtureDir, runDir, { recursive: true });
  cpSync(path.join(mutationDir, `${candidate}.js`), path.join(runDir, 'discount.js'));
  const started = performance.now();
  const result = command('node', ['test.js'], { cwd: runDir });
  return {
    candidate,
    success: result.status === 0,
    exit_code: result.status,
    duration_ms: Math.round((performance.now() - started) * 100) / 100,
  };
}

rmSync(scratchRoot, { recursive: true, force: true });
mkdirSync(scratchRoot, { recursive: true });
mkdirSync(resultDir, { recursive: true });

const samples = [];
for (let run = 1; run <= repetitions; run += 1) {
  const single = executeCandidate(path.join(scratchRoot, `single-${run}`), 'candidate-b');

  const retryStarted = performance.now();
  const retryAttempts = [];
  for (const candidate of ['candidate-b', 'candidate-c', 'candidate-a']) {
    const attempt = executeCandidate(path.join(scratchRoot, `retry-${run}-${candidate}`), candidate);
    retryAttempts.push(attempt);
    if (attempt.success) break;
  }
  const sequentialRetry = {
    success: retryAttempts.at(-1).success,
    attempts: retryAttempts.length,
    duration_ms: Math.round((performance.now() - retryStarted) * 100) / 100,
    candidates: retryAttempts,
  };

  const genosStarted = performance.now();
  const genosRun = command('./examples/safe-debugging-demo/run-demo.sh', [], { stdio: 'pipe' });
  if (genosRun.status !== 0) {
    throw new Error(`GenOS run ${run} failed: ${genosRun.stderr || genosRun.stdout}`);
  }
  const evidence = JSON.parse(readFileSync(demoReport, 'utf8'));
  const genos = {
    success: evidence.selection.merge_decision === 'approved',
    duration_ms: Math.round((performance.now() - genosStarted) * 100) / 100,
    isolated_candidates: evidence.candidates.length,
    rejected_candidates: evidence.candidates.filter((candidate) => !candidate.success).length,
    replay_verified: evidence.selection.replay_verified,
    merge_decision: evidence.selection.merge_decision,
    model_calls: evidence.usage.model_calls,
    input_tokens: evidence.usage.input_tokens,
    output_tokens: evidence.usage.output_tokens,
    cost_usd: evidence.usage.cost_usd,
  };

  samples.push({ run, single_attempt: single, sequential_retry: sequentialRetry, genos });
  console.log(`run ${String(run).padStart(2)}: single=${single.success ? 'pass' : 'fail'} retry=${sequentialRetry.success ? 'pass' : 'fail'} genos=${genos.success ? 'pass' : 'fail'} replay=${genos.replay_verified ? 'yes' : 'no'}`);
}

const revision = version('git', ['rev-parse', 'HEAD']);
const report = {
  schema_version: 1,
  benchmark: 'safe-debugging-execution-mechanics',
  generated_at: new Date().toISOString(),
  source_revision: revision,
  source_tree_clean_before_run: true,
  command: `node benchmarks/safe-debugging/run-benchmark.mjs ${repetitions}`,
  repetitions,
  fixture: {
    description: 'A deterministic discount boundary bug with three ordered candidate mutations.',
    candidate_order: ['candidate-b', 'candidate-c', 'candidate-a'],
    expected_winner: 'candidate-a',
  },
  environment: {
    os: `${os.platform()} ${os.release()}`,
    architecture: os.arch(),
    cpu: os.cpus()[0]?.model ?? 'unknown',
    logical_cpus: os.cpus().length,
    memory_bytes: os.totalmem(),
    node: process.version,
    rustc: version('rustc', ['--version']),
  },
  results: {
    single_attempt: summarize(samples, (sample) => sample.single_attempt.success, (sample) => sample.single_attempt.duration_ms),
    sequential_retry: {
      ...summarize(samples, (sample) => sample.sequential_retry.success, (sample) => sample.sequential_retry.duration_ms),
      attempts_per_success: samples.map((sample) => sample.sequential_retry.attempts),
    },
    genos: {
      ...summarize(samples, (sample) => sample.genos.success, (sample) => sample.genos.duration_ms),
      replay_verified_runs: samples.filter((sample) => sample.genos.replay_verified).length,
      merge_approved_runs: samples.filter((sample) => sample.genos.merge_decision === 'approved').length,
      isolated_candidates_per_run: 3,
      measured_usage: {
        model_calls: samples.reduce((sum, sample) => sum + sample.genos.model_calls, 0),
        input_tokens: samples.reduce((sum, sample) => sum + sample.genos.input_tokens, 0),
        output_tokens: samples.reduce((sum, sample) => sum + sample.genos.output_tokens, 0),
        cost_usd: samples.reduce((sum, sample) => sum + sample.genos.cost_usd, 0),
      },
    },
  },
  interpretation: [
    'The single-attempt and retry modes use an intentionally fixed candidate order; they do not represent an AI agent.',
    'Wall times are recorded for transparency but are not a fair performance comparison: GenOS includes CLI orchestration, snapshots, forks, diffs, replay and evidence writes.',
    'The result demonstrates execution mechanics and repeatability for this fixture, not model quality or general task success.',
    'All token and cost values are zero because this deterministic harness invokes no language model.',
  ],
};

writeFileSync(path.join(resultDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(path.join(resultDir, 'samples.jsonl'), `${samples.map((sample) => JSON.stringify(sample)).join('\n')}\n`);
console.log(`\nresults: ${path.relative(repoRoot, path.join(resultDir, 'latest.json'))}`);
