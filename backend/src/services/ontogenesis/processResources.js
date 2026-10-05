'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const exec = promisify(execFile);

async function processRows() {
  if (process.platform === 'win32') {
    const script = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,CommandLine | ConvertTo-Json -Compress';
    const result = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 10000 });
    return [].concat(JSON.parse(result.stdout)).map(windowsRow);
  }
  const result = await exec('ps', ['-eo', 'pid=,ppid=,rss=,args='], { maxBuffer: 8 * 1024 * 1024, timeout: 10000 });
  return result.stdout.trim().split('\n').map(unixRow);
}

function processAlive(pid) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) return false;
  try {
    process.kill(numericPid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

function windowsRow(row) {
  return { pid: Number(row.ProcessId), parent: Number(row.ParentProcessId), mb: Number(row.WorkingSetSize) / 1048576, command: row.CommandLine || '' };
}

function unixRow(row) {
  const match = row.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
  if (!match) return { pid: 0, parent: 0, mb: 0, command: '' };
  return { pid: Number(match[1]), parent: Number(match[2]), mb: Number(match[3]) / 1024, command: match[4] };
}

function treeRows(rows, roots) {
  const ids = new Set(roots);
  let size;
  do {
    size = ids.size;
    for (const row of rows) if (ids.has(row.parent)) ids.add(row.pid);
  } while (size !== ids.size);
  return rows.filter((row) => ids.has(row.pid));
}

function ownsProcess(row, run, runnerPath) {
  if (!row || row.pid !== run.pid) return false;
  const command = row.command.replace(/\\/g, '/');
  return command.includes(runnerPath.replace(/\\/g, '/')) && command.split(/[\s"']+/).includes(run.id);
}

module.exports = { processRows, processAlive, treeRows, ownsProcess };
