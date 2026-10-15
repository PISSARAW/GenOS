'use strict';

const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

function linuxThreadCpuMs(pid) {
  const threadsPath = `/proc/${pid}/task`;
  const threads = fs.readdirSync(threadsPath);
  return threads.reduce((total, threadId) => {
    const [nanoseconds] = fs.readFileSync(`${threadsPath}/${threadId}/schedstat`, 'utf8').trim().split(/\s+/);
    return total + Number(nanoseconds) / 1_000_000;
  }, 0);
}

async function windowsProcessCpuMs(pid) {
  const script = `$p=Get-Process -Id ${pid}; [Console]::Write($p.TotalProcessorTime.TotalMilliseconds.ToString([Globalization.CultureInfo]::InvariantCulture))`;
  const result = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    timeout: 1500, windowsHide: true, maxBuffer: 1024
  });
  return Number(result.stdout.trim());
}

async function processCpuMs(pid, platform = process.platform) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('A valid child PID is required for CPU accounting.');
  if (platform === 'linux') return linuxThreadCpuMs(pid);
  if (platform === 'win32') return windowsProcessCpuMs(pid);
  throw new Error(`Per-process CPU accounting is unsupported on '${platform}'.`);
}

module.exports = { processCpuMs };
