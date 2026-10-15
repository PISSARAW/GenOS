'use strict';

const fsSync = require('node:fs');
const { spawn } = require('node:child_process');

function ensureCwd(spawnOptions) {
  if (!spawnOptions || !spawnOptions.cwd) return;
  try { fsSync.mkdirSync(spawnOptions.cwd, { recursive: true }); } catch (_) {}
}

function sleepMs(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === 'function') timer.unref();
  });
}

function probeArgs(spawnSpec) {
  const isNodeScript = spawnSpec.cmd === process.execPath;
  return isNodeScript ? ['-e', ''] : ['--version'];
}

function probeAttempt(spawnSpec) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => { if (!settled) { settled = true; resolve(ok); } };
    let probe;
    try {
      probe = spawn(spawnSpec.cmd, probeArgs(spawnSpec), { stdio: 'ignore' });
    } catch (_) { done(false); return; }
    const timer = setTimeout(() => { try { probe.kill('SIGKILL'); } catch (_) {} done(false); }, 5000);
    if (typeof timer.unref === 'function') timer.unref();
    probe.on('error', () => { clearTimeout(timer); done(false); });
    probe.on('close', (code) => { clearTimeout(timer); done(code === 0); });
  });
}

async function probeCommand(spawnSpec) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ok = await probeAttempt(spawnSpec);
    if (ok) return true;
    if (!fsSync.existsSync(spawnSpec.cmd) || attempt === 2) return false;
    await sleepMs(200);
  }
  return false;
}

function attachNoopErrorSinks(child) {
  if (child.stdin) child.stdin.on('error', () => {});
  if (child.stdout) child.stdout.on('error', () => {});
  if (child.stderr) child.stderr.on('error', () => {});
}

function isTransientSpawnError(err) {
  return err.code === 'ENOTCONN' || err.code === 'ECONNREFUSED' || err.code === 'EPERM' || err.code === 'EACCES';
}

async function spawnWithRetry(spawnSpec, spawnOptions, maxAttempts) {
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const child = spawn(spawnSpec.cmd, spawnSpec.args, spawnOptions);
      attachNoopErrorSinks(child);
      await new Promise((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
      });
      return child;
    } catch (err) {
      lastError = err;
      const executableExists = fsSync.existsSync(spawnSpec.cmd);
      const canRetry = attempt < maxAttempts - 1
        && (isTransientSpawnError(err) || (err.code === 'ENOENT' && executableExists));
      if (!canRetry) throw err;
      await sleepMs(400);
    }
  }
  throw lastError;
}

async function spawnRuntimeWithRetry(spawnSpec, spawnOptions) {
  // Recreate missing cwd and probe through transient locks before spawn.
  ensureCwd(spawnOptions);
  await probeCommand(spawnSpec);
  return spawnWithRetry(spawnSpec, spawnOptions, 3);
}

module.exports = { spawnRuntimeWithRetry };
