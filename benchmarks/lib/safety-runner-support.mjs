import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const benchmarkRoot = path.join(repositoryRoot, 'benchmarks');

export function runCommand(id, command, options) {
  const cwd = path.resolve(repositoryRoot, options.relativeDirectory);
  const started = Date.now();
  const environment = command === 'cargo'
    ? {
        ...process.env,
        CARGO_INCREMENTAL: '0',
        CARGO_TARGET_DIR: process.env.GENOS_BENCHMARK_TARGET_DIR
          || path.join(benchmarkRoot, 'workspace', '.cargo-target-safety-specialists'),
      }
    : process.env;
  const result = spawnSync(command, options.args, { cwd, encoding: 'utf8', env: environment, maxBuffer: 16 * 1024 * 1024 });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const combined = `${stdout}\n${stderr}`;
  return {
    id,
    status: result.status === 0 ? 'passed' : 'failed',
    command: [command, ...options.args],
    cwd: path.relative(repositoryRoot, cwd) || '.',
    exit_code: result.status,
    signal: result.signal,
    duration_ms: Date.now() - started,
    output_sha256: crypto.createHash('sha256').update(combined).digest('hex'),
    stdout_tail: tail(stdout),
    stderr_tail: tail(stderr),
    error: result.error?.message || null,
  };
}

export function repositoryEvidence() {
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' });
  const status = spawnSync('git', ['status', '--short'], { cwd: repositoryRoot, encoding: 'utf8' });
  return {
    revision: revision.status === 0 ? revision.stdout.trim() : null,
    dirty: status.status === 0 ? status.stdout.trim().length > 0 : null,
  };
}

export function collectFindings(predicates, commands) {
  const failedPredicates = predicates.filter((item) => item.status !== 'passed').map((item) => item.id);
  const failedCommands = commands.filter((item) => item.status !== 'passed').map((item) => item.id);
  if (failedPredicates.length === 0 && failedCommands.length === 0) {
    return [{ severity: 'info', code: 'LOCAL_CONTROLS_PASS', detail: 'All deterministic local controls and required suites passed.' }];
  }
  return [
    ...(failedPredicates.length ? [{ severity: 'high', code: 'CONTROL_FAILURE', controls: failedPredicates }] : []),
    ...(failedCommands.length ? [{ severity: 'high', code: 'SUITE_FAILURE', suites: failedCommands }] : []),
  ];
}

function tail(value, lines = 12) {
  return value.trim().split(/\r?\n/).slice(-lines).join('\n');
}
