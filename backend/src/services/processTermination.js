const DEFAULT_GRACE_MS = 5000;
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { readGracePeriod } = require('./runtimeConfig');

function gracePeriodMs() {
  return readGracePeriod(process.env.GENOS_PROCESS_GRACE_MS, DEFAULT_GRACE_MS);
}

function normalizePid(pid) {
  const numericPid = Number(pid);
  return Number.isInteger(numericPid) && numericPid > 0 ? numericPid : null;
}

// Never signal a whole process group unless the PID really is its group leader.
// `process.kill(-pid)` on an arbitrary PID would otherwise target every
// killable process of the user (Linux) — the root of the arbitrary-kill bug.
function isGroupLeader(pid) {
  if (process.platform === 'win32' || typeof process.getpgid !== 'function') return false;
  try { return process.getpgid(pid) === pid; } catch (_) { return false; }
}

function signalProcess(pid, signal) {
  if (isGroupLeader(pid)) {
    try { process.kill(-pid, signal); return; } catch (_) { /* fall back to single pid */ }
  }
  process.kill(pid, signal);
}

function readProcessCommandLine(pid) {
  if (process.platform === 'win32') {
    const command = `(Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\").CommandLine`;
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true });
  }
  return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
}

// A substring match on `node`/`python` is far too loose. Prefer an exact path
// match when the expected executable is a path, otherwise match a whole token.
function commandMatches(commandLine, executable) {
  const expected = String(executable || '').trim().toLowerCase();
  if (!expected) return false;
  const line = String(commandLine || '').toLowerCase();
  if (expected.includes('/') || expected.includes('\\')) {
    return line.includes(expected) || line.includes(expected.replace(/\\/g, '/'));
  }
  const base = path.basename(expected);
  return line.split(/\s+/).some((token) => path.basename(token.replace(/["']/g, '')) === base);
}

function processMatches(pid, executable) {
  const numericPid = normalizePid(pid);
  if (!numericPid) return false;
  // An empty executable cannot be verified: never treat it as a match, so
  // reconciliation never kills a PID whose identity is unknown.
  if (!String(executable || '').trim()) return false;
  try {
    return commandMatches(readProcessCommandLine(numericPid), executable);
  } catch (_) {
    return false;
  }
}

function signalChild(child, numericPid, signal) {
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(numericPid), '/T', ...(signal === 'SIGKILL' ? ['/F'] : [])], { stdio: 'ignore', windowsHide: true });
    } else {
      signalProcess(numericPid, signal);
    }
  } catch (_) {
    try { child.kill(signal); } catch (_) {}
  }
}

function terminateChild(child, detached = false) {
  const numericPid = normalizePid(child?.pid);
  if (!child || !numericPid || child.exitCode !== null || child.signalCode) return false;
  const killGroup = process.platform !== 'win32' && detached;
  if (killGroup) {
    try { process.kill(-numericPid, 'SIGTERM'); } catch (_) { signalChild(child, numericPid, 'SIGTERM'); }
  } else {
    signalChild(child, numericPid, 'SIGTERM');
  }
  const timer = setTimeout(() => {
    if (child.exitCode === null && !child.signalCode) {
      if (killGroup) { try { process.kill(-numericPid, 'SIGKILL'); } catch (_) {} }
      signalChild(child, numericPid, 'SIGKILL');
    }
  }, gracePeriodMs());
  if (typeof timer.unref === 'function') timer.unref();
  child.genosTerminationTimer = timer;
  return true;
}

function terminatePid(pid) {
  const numericPid = normalizePid(pid);
  if (!numericPid || numericPid === process.pid) return false;
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(numericPid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      signalProcess(numericPid, 'SIGTERM');
    }
    return true;
  } catch (_) {
    return false;
  }
}

function clearTerminationTimer(child) {
  if (!child?.genosTerminationTimer) return;
  clearTimeout(child.genosTerminationTimer);
  child.genosTerminationTimer = null;
}

module.exports = { DEFAULT_GRACE_MS, gracePeriodMs, processMatches, terminateChild, terminatePid, clearTerminationTimer };
