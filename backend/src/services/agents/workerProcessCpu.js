'use strict';

const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

function linuxProcessRows() {
  return fs.readdirSync('/proc').filter((name) => /^\d+$/.test(name)).flatMap((name) => {
    try {
      const raw = fs.readFileSync(`/proc/${name}/stat`, 'utf8');
      const fields = raw.slice(raw.lastIndexOf(')') + 2).trim().split(/\s+/);
      return [{ pid: Number(name), parentPid: Number(fields[1]), identity: `${name}:${fields[19]}` }];
    } catch (_) { return []; }
  });
}

function linuxThreadCpuMs(pid) {
  const taskPath = `/proc/${pid}/task`;
  return fs.readdirSync(taskPath).reduce((total, threadId) => {
    const [nanoseconds] = fs.readFileSync(`${taskPath}/${threadId}/schedstat`, 'utf8').trim().split(/\s+/);
    return total + Number(nanoseconds) / 1_000_000;
  }, 0);
}

function linuxFamilyWithCpu(pid) {
  return processFamily(linuxProcessRows(), pid).flatMap((row) => {
    try { return [{ ...row, cpuMs: linuxThreadCpuMs(row.pid) }]; }
    catch (_) { return []; }
  });
}

async function windowsProcessRows(pid) {
  const script = `$p=Get-Process -Id ${pid}; $cpu=$p.TotalProcessorTime.TotalMilliseconds.ToString([Globalization.CultureInfo]::InvariantCulture); [Console]::WriteLine(('{0},-1,{0},{1}' -f ${pid},$cpu))`;
  const result = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    timeout: 1500, windowsHide: true, maxBuffer: 4 * 1024 * 1024
  });
  return result.stdout.split(/\r?\n/).flatMap((line) => {
    const [rawPid, rawParent, created, rawCpu] = line.split(',');
    const entry = { pid: Number(rawPid), parentPid: Number(rawParent), identity: `${rawPid}:${created}`, cpuMs: Number(rawCpu) };
    return Number.isSafeInteger(entry.pid) && Number.isFinite(entry.cpuMs) ? [entry] : [];
  });
}

function processFamily(rows, rootPid) {
  const root = rows.find((row) => row.pid === rootPid);
  if (!root) return [];
  const children = new Map();
  rows.forEach((row) => children.set(row.parentPid, [...(children.get(row.parentPid) || []), row]));
  const family = [root];
  const pending = [rootPid];
  while (pending.length) {
    const parentPid = pending.pop();
    const members = children.get(parentPid) || [];
    family.push(...members);
    members.forEach((member) => pending.push(member.pid));
  }
  return family;
}

async function currentProcessRows(pid, platform) {
  if (platform === 'linux') return linuxFamilyWithCpu(pid);
  if (platform === 'win32') return windowsProcessRows(pid);
  throw new Error(`Per-process CPU accounting is unsupported on '${platform}'.`);
}

function rememberUsage(state, family) {
  if (!state.processUsage) state.processUsage = new Map();
  family.forEach((row) => {
    const previous = state.processUsage.get(row.identity) || 0;
    if (row.cpuMs > previous) state.processUsage.set(row.identity, row.cpuMs);
  });
  return [...state.processUsage.values()].reduce((sum, usage) => sum + usage, 0);
}

async function processCpuMs(pid, platform = process.platform, state = {}) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('A valid child PID is required for CPU accounting.');
  const rows = await currentProcessRows(pid, platform);
  if (!rows.some((row) => row.pid === pid)) throw new Error('Worker process was not found in the CPU sample.');
  return rememberUsage(state, rows);
}

module.exports = { processCpuMs };
