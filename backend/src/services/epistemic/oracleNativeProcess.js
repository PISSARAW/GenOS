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
    child.on('error', failure => { clearTimeout(timer); reject(failure); });
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
  try {
    const execution = await execute(input, { cwd, entry, timeoutMs: Math.min(30000, Math.max(1, Number(options.timeoutMs) || 10000)) });
    const result = execution.code === 0 && !execution.timedOut ? JSON.parse(execution.stdout)
      : { status: 'inconclusive', reason: execution.timedOut ? 'oracle_timeout' : 'oracle_process_failed' };
    if (result.processId && result.processId !== execution.processId) throw new Error('ORACLE_PROCESS_ID_MISMATCH');
    return { result, detail: { executionId: randomUUID(), processId: execution.processId, cwd,
      exitCode: execution.code, timedOut: execution.timedOut, durationMs: Date.now() - started,
      inputDigest: `sha256:${createHash('sha256').update(input).digest('hex')}`,
      executable: process.execPath, implementation: entry } };
  } finally { await fs.rm(cwd, { recursive: true, force: true }); }
}

function entryFor(kind) {
  if (!kind || kind === 'subset') return require.resolve('./oracleNativeEntry.cjs');
  if (kind === 'memory') return require.resolve('./oracleMemoryNativeEntry.cjs');
  throw new Error('ORACLE_KIND_UNAVAILABLE');
}

module.exports = { run };
