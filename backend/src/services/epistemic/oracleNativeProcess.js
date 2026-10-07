'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');

function environment() {
  return { ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    NODE_DISABLE_COMPILE_CACHE: '1' };
}

function execute(input, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [options.entry], {
      cwd: options.cwd, env: environment(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, options.timeoutMs);
    child.on('error', failure => { clearTimeout(timer); failure.processId = child.pid; reject(failure); });
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 16384) child.kill(); });
    child.stderr.on('data', chunk => { stderr += chunk; if (stderr.length > 16384) child.kill(); });
    child.stdin.on('error', () => {});
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, timedOut, stdout, processId: child.pid });
    });
    child.stdin.end(input);
  });
}

async function run(subject, options) {
  const entry = entryFor(options.kind);
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-subset-oracle-'));
  const input = JSON.stringify({ subject, strategy: options.strategy });
  if (Buffer.byteLength(input) > 131072) { await fs.rm(cwd, { recursive: true, force: true }); throw new Error('ORACLE_INPUT_TOO_LARGE'); }
  const started = Date.now();
  const base = { executionId: randomUUID(), strategy: options.strategy, cwd,
    inputDigest: `sha256:${createHash('sha256').update(input).digest('hex')}`,
    executable: process.execPath, implementation: entry, startedAt: new Date(started).toISOString(),
    timeoutMs: Math.min(30000, Math.max(1, Number(options.timeoutMs) || 10000)) };
  try {
    await observe(options, { ...base, phase: 'intent' });
    const execution = await measuredExecution(input, { cwd, entry, timeoutMs: base.timeoutMs });
    const result = parseResult(execution);
    const detail = { ...base, processId: execution.processId || null,
      exitCode: execution.code, timedOut: execution.timedOut, durationMs: Date.now() - started,
      spawnError: execution.spawnError || null };
    await observe(options, { ...detail, phase: 'finished', processOutcome: result.status, processReason: result.reason || null });
    return { result, detail };
  } finally { await fs.rm(cwd, { recursive: true, force: true }); }
}

async function measuredExecution(input, options) {
  try { return await execute(input, options); }
  catch (failure) { return { code: null, timedOut: false, stdout: '', processId: failure.processId || null,
    spawnError: failure.code || failure.message }; }
}

function parseResult(execution) {
  if (execution.timedOut) return { status: 'inconclusive', reason: 'oracle_timeout' };
  if (execution.code !== 0) return { status: 'inconclusive', reason: 'oracle_process_failed' };
  try {
    const result = JSON.parse(execution.stdout);
    if (!['verified', 'refuted', 'inconclusive'].includes(result?.status)) throw new Error('Invalid oracle result');
    if (result.processId && result.processId !== execution.processId) return { status: 'inconclusive', reason: 'oracle_process_id_mismatch' };
    return result;
  } catch (_) { return { status: 'inconclusive', reason: 'oracle_response_invalid' }; }
}

async function observe(options, execution) {
  if (options.onExecution) await options.onExecution(execution);
}

function entryFor(kind) {
  if (!kind || kind === 'subset') return require.resolve('./oracleNativeEntry.cjs');
  if (kind === 'memory') return require.resolve('./oracleMemoryNativeEntry.cjs');
  if (kind === 'code') return require.resolve('./oracleCodeNativeEntry.cjs');
  throw new Error('ORACLE_KIND_UNAVAILABLE');
}

module.exports = { run };
