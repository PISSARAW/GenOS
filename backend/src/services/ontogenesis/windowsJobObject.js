'use strict';

const { spawn } = require('node:child_process');
const readline = require('node:readline');

const READY_PREFIX = 'GENOS_JOB:';
const DEFAULT_START_TIMEOUT_MS = 30000;

const JOB_HOST_SOURCE = String.raw`
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public sealed class GenosJobLease {
  public IntPtr Job;
  public IntPtr Process;
  public IntPtr Owner;
  public uint Pid;
}

public static class GenosJobHost {
  const uint CREATE_SUSPENDED = 0x00000004;
  const uint CREATE_NO_WINDOW = 0x08000000;
  const uint JOB_OBJECT_LIMIT_JOB_MEMORY = 0x00000200;
  const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
  const uint SYNCHRONIZE = 0x00100000;
  const uint INFINITE = 0xffffffff;
  const uint WAIT_OBJECT_0 = 0;
  const uint WAIT_FAILED = 0xffffffff;

  [StructLayout(LayoutKind.Sequential)]
  struct STARTUPINFO {
    public uint cb; public IntPtr reserved; public IntPtr desktop; public IntPtr title;
    public uint x, y, xSize, ySize, xChars, yChars, fill, flags;
    public ushort showWindow, reserved2; public IntPtr reservedBytes, stdin, stdout, stderr;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct PROCESS_INFORMATION {
    public IntPtr process, thread; public uint processId, threadId;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct BASIC_LIMITS {
    public long processTime, jobTime; public uint flags;
    public UIntPtr minimumWorkingSet, maximumWorkingSet;
    public uint activeProcessLimit; public UIntPtr affinity;
    public uint priorityClass, schedulingClass;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct IO_COUNTERS {
    public ulong readOps, writeOps, otherOps, readBytes, writeBytes, otherBytes;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct EXTENDED_LIMITS {
    public BASIC_LIMITS basic; public IO_COUNTERS io;
    public UIntPtr processMemory, jobMemory, peakProcessMemory, peakJobMemory;
  }

  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern IntPtr CreateJobObjectW(IntPtr attributes, string name);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint length);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool CreateProcessW(string application, StringBuilder commandLine,
    IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles, uint flags,
    IntPtr environment, string directory, ref STARTUPINFO startup, out PROCESS_INFORMATION process);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern uint WaitForMultipleObjects(uint count, IntPtr[] handles, bool waitAll, uint milliseconds);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool TerminateProcess(IntPtr process, uint exitCode);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool TerminateJobObject(IntPtr job, uint exitCode);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool CloseHandle(IntPtr handle);

  static Win32Exception Error(string operation) {
    return new Win32Exception(Marshal.GetLastWin32Error(), operation);
  }

  static string Quote(string value) {
    var output = new StringBuilder("\"");
    var slashes = 0;
    foreach (var character in value ?? "") {
      if (character == '\\') { slashes++; continue; }
      if (character == '"') output.Append('\\', slashes * 2 + 1);
      else output.Append('\\', slashes);
      output.Append(character); slashes = 0;
    }
    output.Append('\\', slashes * 2); output.Append('"');
    return output.ToString();
  }

  static StringBuilder CommandLine(string application, string[] arguments) {
    var command = new StringBuilder(Quote(application));
    foreach (var argument in arguments ?? new string[0]) command.Append(' ').Append(Quote(argument));
    return command;
  }

  static void ApplyLimits(IntPtr job, ulong memoryBytes) {
    var limits = new EXTENDED_LIMITS();
    limits.basic.flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if (memoryBytes > 0) {
      limits.basic.flags |= JOB_OBJECT_LIMIT_JOB_MEMORY;
      limits.jobMemory = new UIntPtr(memoryBytes);
    }
    var size = (uint)Marshal.SizeOf(typeof(EXTENDED_LIMITS));
    var buffer = Marshal.AllocHGlobal((int)size);
    try {
      Marshal.StructureToPtr(limits, buffer, false);
      if (!SetInformationJobObject(job, 9, buffer, size)) throw Error("SetInformationJobObject");
    } finally { Marshal.FreeHGlobal(buffer); }
  }

  public static GenosJobLease Start(string application, string[] arguments,
      string directory, uint ownerPid, ulong memoryBytes) {
    var job = CreateJobObjectW(IntPtr.Zero, null);
    if (job == IntPtr.Zero) throw Error("CreateJobObject");
    PROCESS_INFORMATION created = new PROCESS_INFORMATION();
    try {
      ApplyLimits(job, memoryBytes);
      var startup = new STARTUPINFO(); startup.cb = (uint)Marshal.SizeOf(typeof(STARTUPINFO));
      if (!CreateProcessW(application, CommandLine(application, arguments), IntPtr.Zero, IntPtr.Zero,
          false, CREATE_SUSPENDED | CREATE_NO_WINDOW, IntPtr.Zero, directory, ref startup, out created))
        throw Error("CreateProcess");
      if (!AssignProcessToJobObject(job, created.process)) throw Error("AssignProcessToJobObject");
      var owner = OpenProcess(SYNCHRONIZE, false, ownerPid);
      if (owner == IntPtr.Zero) throw Error("OpenProcess(owner)");
      if (ResumeThread(created.thread) == WAIT_FAILED) throw Error("ResumeThread");
      CloseHandle(created.thread); created.thread = IntPtr.Zero;
      return new GenosJobLease { Job = job, Process = created.process, Owner = owner, Pid = created.processId };
    } catch {
      if (created.process != IntPtr.Zero) TerminateProcess(created.process, 125);
      if (created.thread != IntPtr.Zero) CloseHandle(created.thread);
      if (created.process != IntPtr.Zero) CloseHandle(created.process);
      CloseHandle(job);
      throw;
    }
  }

  public static int WaitAndClose(GenosJobLease lease) {
    try {
      var result = WaitForMultipleObjects(2, new IntPtr[] { lease.Process, lease.Owner }, false, INFINITE);
      if (result == WAIT_OBJECT_0 + 1) TerminateJobObject(lease.Job, 125);
      else if (result != WAIT_OBJECT_0) {
        TerminateJobObject(lease.Job, 125);
        throw Error("WaitForMultipleObjects");
      }
      uint exitCode;
      return GetExitCodeProcess(lease.Process, out exitCode) ? unchecked((int)exitCode) : 125;
    } finally {
      CloseHandle(lease.Owner); CloseHandle(lease.Process); CloseHandle(lease.Job);
    }
  }
}`;

function hostScript(payload) {
  return `$source = @'\n${JOB_HOST_SOURCE}\n'@\n`
    + `Add-Type -TypeDefinition $source -ErrorAction Stop\n`
    + `$json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}'))\n`
    + `$spec = ConvertFrom-Json $json\n`
    + `$lease = [GenosJobHost]::Start($spec.application, [string[]]$spec.arguments, $spec.cwd, `
    + `[uint32]$spec.ownerPid, [uint64]$spec.memoryBytes)\n`
    + `[Console]::Out.WriteLine('${READY_PREFIX}' + $lease.Pid)\n[Console]::Out.Flush()\n`
    + `exit [GenosJobHost]::WaitAndClose($lease)`;
}

function validateInput(input) {
  if (!input || typeof input.application !== 'string' || !input.application) throw new Error('job-application-requise');
  if (!Array.isArray(input.arguments)) throw new Error('job-arguments-invalides');
  if (!Number.isSafeInteger(input.ownerPid) || input.ownerPid <= 0) throw new Error('job-owner-pid-invalide');
  if (!Number.isFinite(input.memoryMb) || input.memoryMb <= 0) throw new Error('job-memoire-invalide');
}

function encodedSpec(input) {
  const spec = { application: input.application, arguments: input.arguments, cwd: input.cwd,
    ownerPid: input.ownerPid, memoryBytes: Math.floor(input.memoryMb * 1024 * 1024) };
  return Buffer.from(JSON.stringify(spec), 'utf8').toString('base64');
}

function settleHost(host, state, outcome) {
  clearTimeout(state.timer);
  state.lines.close();
  host.removeListener('error', state.onError);
  host.removeListener('close', state.onClose);
  if (outcome.error) {
    try { host.kill(); } catch (_) {}
    state.reject(outcome.error);
  } else state.resolve(outcome.pid);
}

function waitForHandshake(host, timeoutMs) {
  return new Promise((resolve, reject) => {
    const state = { resolve, reject, stderr: '', lines: readline.createInterface({ input: host.stdout }) };
    state.onError = (error) => settleHost(host, state, { error });
    state.onClose = (code) => settleHost(host, state, {
      error: new Error(`job-host-ferme:${code}:${state.stderr.trim()}`) });
    state.lines.on('line', (line) => {
      if (!line.startsWith(READY_PREFIX)) return;
      const pid = Number(line.slice(READY_PREFIX.length));
      if (!Number.isSafeInteger(pid) || pid <= 0) {
        return settleHost(host, state, { error: new Error('job-host-pid-invalide') });
      }
      settleHost(host, state, { pid });
    });
    host.stderr.on('data', (chunk) => { state.stderr += chunk.toString(); });
    host.once('error', state.onError);
    host.once('close', state.onClose);
    state.timer = setTimeout(() => settleHost(host, state,
      { error: new Error('job-host-demarrage-expire') }), timeoutMs);
  });
}

function detachHost(host) {
  host.unref();
  if (typeof host.stdout.unref === 'function') host.stdout.unref();
  if (typeof host.stderr.unref === 'function') host.stderr.unref();
}

async function launchInWindowsJob(input, dependencies = {}) {
  validateInput(input);
  const platform = dependencies.platform || process.platform;
  if (platform !== 'win32') throw new Error('job-object-windows-requis');
  const spawnProcess = dependencies.spawn || spawn;
  const host = spawnProcess('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive',
    '-Command', hostScript(encodedSpec(input))], {
    cwd: input.cwd, env: input.env || process.env, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'], shell: false
  });
  const pid = await waitForHandshake(host, input.startTimeoutMs || DEFAULT_START_TIMEOUT_MS);
  detachHost(host);
  return { pid, hostPid: host.pid, executable: input.application,
    confinement: 'windows-job-object', memoryLimitMb: input.memoryMb };
}

module.exports = { launchInWindowsJob, JOB_HOST_SOURCE, READY_PREFIX };
