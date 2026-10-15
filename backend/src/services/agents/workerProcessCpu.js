'use strict';

const fs = require('node:fs');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
let windowsProbeProcess;
let windowsProbeReady;
let windowsProbeLines = [];
let windowsProbeActive = null;
const windowsProbeQueue = [];

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

const WINDOWS_PROCESS_PROBE = String.raw`
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
public static class GenosProcessProbe {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  private struct ProcessEntry {
    public uint Size, Usage, Pid; public IntPtr Heap; public uint Module, Threads, ParentPid;
    public int BasePriority; public uint Flags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string Name;
  }
  [DllImport("kernel32.dll", SetLastError=true)] private static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
  [DllImport("kernel32.dll", EntryPoint="Process32FirstW", CharSet=CharSet.Unicode, SetLastError=true)] private static extern bool First(IntPtr snapshot, ref ProcessEntry entry);
  [DllImport("kernel32.dll", EntryPoint="Process32NextW", CharSet=CharSet.Unicode, SetLastError=true)] private static extern bool Next(IntPtr snapshot, ref ProcessEntry entry);
  [DllImport("kernel32.dll", SetLastError=true)] private static extern bool CloseHandle(IntPtr handle);
  public static string[] ReadFamily(int rootPid) {
    var parents = new Dictionary<int, int>();
    var snapshot = CreateToolhelp32Snapshot(2, 0);
    if (snapshot == new IntPtr(-1)) throw new Win32Exception(Marshal.GetLastWin32Error());
    try {
      var entry = new ProcessEntry { Size = (uint)Marshal.SizeOf(typeof(ProcessEntry)) };
      if (!First(snapshot, ref entry)) throw new Win32Exception(Marshal.GetLastWin32Error());
      do { parents[(int)entry.Pid] = (int)entry.ParentPid; entry.Size = (uint)Marshal.SizeOf(typeof(ProcessEntry)); }
      while (Next(snapshot, ref entry));
    } finally { CloseHandle(snapshot); }
    var family = new HashSet<int> { rootPid };
    var pending = new Queue<int>(); pending.Enqueue(rootPid);
    while (pending.Count > 0) {
      var parent = pending.Dequeue();
      foreach (var pair in parents) if (pair.Value == parent && family.Add(pair.Key)) pending.Enqueue(pair.Key);
    }
    if (!parents.ContainsKey(rootPid)) throw new InvalidOperationException("Worker process is absent from the process snapshot.");
    var rows = new List<string>();
    foreach (var member in family) {
      try {
        using (var process = Process.GetProcessById(member)) {
          var created = process.StartTime.ToUniversalTime().Ticks.ToString(CultureInfo.InvariantCulture);
          var cpu = process.TotalProcessorTime.TotalMilliseconds.ToString(CultureInfo.InvariantCulture);
          rows.Add(String.Join("\t", member.ToString(CultureInfo.InvariantCulture), parents[member].ToString(CultureInfo.InvariantCulture), created, cpu));
        }
      } catch (ArgumentException) { if (member == rootPid) throw; }
        catch (InvalidOperationException) { if (member == rootPid) throw; }
    }
    return rows.ToArray();
  }
}`;

function windowsProbeScript() {
  return `$probe = @'\n${WINDOWS_PROCESS_PROBE}\n'@; Add-Type -TypeDefinition $probe -ErrorAction Stop; [Console]::Out.WriteLine('READY'); while ($null -ne ($request = [Console]::In.ReadLine())) { try { [GenosProcessProbe]::ReadFamily([int]$request) | ForEach-Object { [Console]::Out.WriteLine($_) }; [Console]::Out.WriteLine('END') } catch { [Console]::Out.WriteLine(('ERROR|' + $_.Exception.Message)); [Console]::Out.WriteLine('END') } }`;
}

function settleWindowsRequest(error, rows) {
  const request = windowsProbeActive;
  windowsProbeActive = null;
  if (!request) return;
  clearTimeout(request.timer);
  if (error) request.reject(error);
  else request.resolve(rows);
  dispatchWindowsRequest();
}

function parseWindowsRow(line) {
  const [rawPid, rawParent, created, rawCpu] = line.split('\t');
  const entry = { pid: Number(rawPid), parentPid: Number(rawParent), identity: `${rawPid}:${created}`, cpuMs: Number(rawCpu) };
  return Number.isSafeInteger(entry.pid) && Number.isFinite(entry.cpuMs) ? entry : null;
}

function handleWindowsProbeLine(line) {
  if (line === 'READY') return;
  if (line === 'END') {
    const rows = windowsProbeLines.map(parseWindowsRow).filter(Boolean);
    windowsProbeLines = [];
    settleWindowsRequest(windowsProbeActive?.error || null, rows);
  } else if (line.startsWith('ERROR|') && windowsProbeActive) {
    windowsProbeActive.error = new Error(line.slice(6));
  } else if (windowsProbeActive) windowsProbeLines.push(line);
}

function failWindowsProbe(error) {
  windowsProbeReady = null;
  if (windowsProbeProcess) windowsProbeProcess.kill();
  windowsProbeProcess = null;
  if (windowsProbeActive) settleWindowsRequest(error);
  while (windowsProbeQueue.length) windowsProbeQueue.shift().reject(error);
}

function startWindowsProbe() {
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', windowsProbeScript()], {
    stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true
  });
  windowsProbeProcess = child;
  const lines = readline.createInterface({ input: child.stdout });
  let ready = false;
  lines.on('line', (line) => {
    handleWindowsProbeLine(line);
    if (line === 'READY') {
      ready = true;
      child.unref();
      child.stdin.unref();
      child.stdout.unref();
    }
  });
  child.stdin.on('error', (error) => {
    if (windowsProbeProcess === child) failWindowsProbe(error);
  });
  return new Promise((resolve, reject) => {
    child.once('error', (error) => {
      if (!ready) reject(error);
      if (windowsProbeProcess === child) failWindowsProbe(error);
    });
    child.once('close', (code) => {
      const error = new Error(`Windows CPU probe exited (${code}).`);
      if (!ready) reject(error);
      if (windowsProbeProcess === child) failWindowsProbe(error);
    });
    lines.once('line', (line) => { if (line === 'READY') resolve(); });
  });
}

async function ensureWindowsProbe() {
  if (windowsProbeProcess && windowsProbeReady) return windowsProbeReady;
  windowsProbeReady = startWindowsProbe();
  await windowsProbeReady;
}

function dispatchWindowsRequest() {
  if (windowsProbeActive || !windowsProbeProcess || !windowsProbeQueue.length) return;
  windowsProbeActive = windowsProbeQueue.shift();
  windowsProbeLines = [];
  windowsProbeActive.timer = setTimeout(() => {
    const error = new Error('Windows CPU sample timed out.');
    settleWindowsRequest(error);
    failWindowsProbe(error);
  }, 1500);
  try { windowsProbeProcess.stdin.write(`${windowsProbeActive.pid}\n`); }
  catch (error) { failWindowsProbe(error); }
}

async function prepareProcessCpuMeter(platform = process.platform) {
  if (platform === 'win32') await ensureWindowsProbe();
}

async function windowsProcessRows(pid) {
  await ensureWindowsProbe();
  return new Promise((resolve, reject) => {
    windowsProbeQueue.push({ pid, resolve, reject });
    dispatchWindowsRequest();
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

async function processCpuMs(pid, platform = process.platform, state) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('A valid child PID is required for CPU accounting.');
  const usageState = state || {};
  const rows = await currentProcessRows(pid, platform);
  if (!rows.some((row) => row.pid === pid)) throw new Error('Worker process was not found in the CPU sample.');
  return rememberUsage(usageState, rows);
}

process.once('exit', () => { if (windowsProbeProcess) windowsProbeProcess.kill(); });

module.exports = { processCpuMs, prepareProcessCpuMeter };
