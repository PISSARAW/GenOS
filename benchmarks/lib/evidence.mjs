import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function runEvidenceCommand({ id, command, args, cwd, evidenceDir, timeoutMs = 1_800_000 }) {
  const startedAt = new Date().toISOString();
  const started = process.hrtime.bigint();
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1', CARGO_TERM_COLOR: 'never' },
  });
  const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const combined = `${stdout}${stderr}`;
  const evidenceFile = path.join(evidenceDir, `${id}.log`);
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(evidenceFile, combined, 'utf8');

  return {
    id,
    command: shellCommand(command, args),
    started_at: startedAt,
    duration_ms: Number(durationMs.toFixed(3)),
    exit_code: result.status,
    signal: result.signal || null,
    timed_out: result.error?.code === 'ETIMEDOUT',
    passed: result.status === 0,
    output_sha256: sha256(combined),
    evidence_file: evidenceFile,
    stdout,
    stderr,
    error: result.error ? String(result.error.message || result.error) : null,
  };
}

export function commandRecord(commandResult, repoRoot) {
  return {
    id: commandResult.id,
    command: commandResult.command,
    started_at: commandResult.started_at,
    duration_ms: commandResult.duration_ms,
    exit_code: commandResult.exit_code,
    signal: commandResult.signal,
    timed_out: commandResult.timed_out,
    passed: commandResult.passed,
    output_sha256: commandResult.output_sha256,
    evidence_file: path.relative(repoRoot, commandResult.evidence_file),
    error: commandResult.error,
  };
}

export function sourceEvidence(repoRoot, relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  return { path: relativePath, sha256: sha256(content), bytes: Buffer.byteLength(content) };
}

export function repositoryMetadata(repoRoot) {
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' });
  const rustc = spawnSync('rustc', ['--version'], { cwd: repoRoot, encoding: 'utf8' });
  return {
    revision: revision.status === 0 ? revision.stdout.trim() : 'unknown',
    dirty: status.status === 0 ? status.stdout.trim().length > 0 : null,
    node: process.version,
    rustc: rustc.status === 0 ? rustc.stdout.trim() : 'unknown',
    os: process.platform,
    architecture: process.arch,
    hostname: process.env.HOSTNAME || 'unknown',
  };
}

export function parseJsonOutput(commandResult) {
  try {
    return JSON.parse(commandResult.stdout);
  } catch (error) {
    throw new Error(`command ${commandResult.id} did not emit valid JSON: ${error.message}`);
  }
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function shellCommand(command, args) {
  return [command, ...args].map((part) => (/^[A-Za-z0-9_./:=+-]+$/.test(part) ? part : JSON.stringify(part))).join(' ');
}
