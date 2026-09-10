const DEFAULT_GRACE_MS = 5000;
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { readGracePeriod } = require('./runtimeConfig');

function gracePeriodMs() {
  return readGracePeriod(process.env.GENOS_PROCESS_GRACE_MS, DEFAULT_GRACE_MS);
}

function processMatches(pid, executable) {
  if (!executable) return true;
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) return false;
  const expected = path.basename(String(executable)).toLowerCase();
  try {
    if (process.platform === 'win32') {
      const command = `(Get-CimInstance Win32_Process -Filter \"ProcessId = ${numericPid}\").CommandLine`;
      const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true });
      return output.toLowerCase().includes(expected);
    }
    const commandLine = fs.readFileSync(`/proc/${numericPid}/cmdline`, 'utf8').replace(/\0/g, ' ');
    return commandLine.toLowerCase().includes(expected);
  } catch (_) {
    return false;
  }
}

function terminateChild(child) {
  const numericPid = Number(child?.pid);
  if (!child || !Number.isInteger(numericPid) || numericPid <= 0 || child.exitCode !== null || child.signalCode) return false;
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/PID', String(numericPid), '/T'], { stdio: 'ignore', windowsHide: true }); } catch (_) { try { child.kill('SIGTERM'); } catch (_) {} }
  } else {
    try { process.kill(-numericPid, 'SIGTERM'); } catch (_) { try { child.kill('SIGTERM'); } catch (_) {} }
  }
  const timer = setTimeout(() => {
    if (child.exitCode === null && !child.signalCode) {
      if (process.platform === 'win32') {
        try { execFileSync('taskkill', ['/PID', String(numericPid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch (_) { try { child.kill('SIGKILL'); } catch (_) {} }
      } else {
        try { process.kill(-numericPid, 'SIGKILL'); } catch (_) { try { child.kill('SIGKILL'); } catch (_) {} }
      }
    }
  }, gracePeriodMs());
  if (typeof timer.unref === 'function') timer.unref();
  child.genosTerminationTimer = timer;
  return true;
}

function terminatePid(pid) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0 || numericPid === process.pid) return false;
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(numericPid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      return true;
    }
    try { process.kill(-numericPid, 'SIGTERM'); }
    catch (_) { process.kill(numericPid, 'SIGTERM'); }
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
