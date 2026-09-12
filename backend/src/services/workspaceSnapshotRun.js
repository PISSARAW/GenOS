/**
 * Snapshot test-execution + git helpers (split of workspaceSnapshotStore.js).
 */
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { appendBounded } = require('./boundedOutput');
const { terminateChild } = require('./processTermination');
const { normalizeSandboxCommand, isAllowedSandboxTestCommand } = require('./sandboxCommandPolicy');
const { materialize } = require('./workspaceSnapshotMaterialize');

function isGitWorkspace(workspacePath) {
  return Boolean(workspacePath) && fs.existsSync(path.join(workspacePath, '.git'));
}

/**
 * Check out `commit` as a detached git worktree at `destination`. The worktree
 * shares the workspace object store, so materializing a snapshot costs one
 * checkout instead of one file copy per tracked file.
 * Returns an async cleanup that removes the worktree registration and files.
 */
function spawnGit(workspacePath, args) {
  const { spawn } = require('child_process');
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', workspacePath, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr = appendBounded(stderr, chunk); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim() || `git ${args.join(' ')} exited with code ${code}`))));
  });
}

async function materializeGitWorktree(workspacePath, commit, destination) {
  try {
    await spawnGit(workspacePath, ['worktree', 'add', '--detach', destination, commit]);
  } catch (err) {
    try {
      await spawnGit(workspacePath, ['worktree', 'remove', '--force', destination]).catch(() => {});
      await spawnGit(workspacePath, ['worktree', 'prune']).catch(() => {});
      await fsp.rm(destination, { recursive: true, force: true }).catch(() => {});
    } catch (_) {}
    throw err;
  }
  return async () => {
    await spawnGit(workspacePath, ['worktree', 'remove', '--force', destination]).catch(() => {});
    await spawnGit(workspacePath, ['worktree', 'prune']).catch(() => {});
  };
}

// Commands executed inside snapshots run through a platform shell, so the
// input must be constrained to a fixed vocabulary of test commands. Anything
// else would be arbitrary remote code execution for the caller.
function isAllowedTestCommand(command) {
  return isAllowedSandboxTestCommand(command);
}

function assertAllowedTestCommand(command) {
  const normalized = normalizeSandboxCommand(command);
  if (!normalized || !normalized.match(/^[a-zA-Z0-9_./:\- ]+$/)) {
    throw Object.assign(
      new Error('Test command is not allowed.'),
      { code: 'TEST_COMMAND_NOT_ALLOWED' }
    );
  }
  if (!isAllowedTestCommand(normalized)) {
    throw Object.assign(
      new Error('Test command is not allowed.'),
      { code: 'TEST_COMMAND_NOT_ALLOWED' }
    );
  }
  return normalized;
}

function isolatedRunnerEnv(runnerRoot) {
  const base = {
    PATH: process.env.PATH || '/usr/bin:/bin',
    CI: '1',
    GENOS_ISOLATED_RUNNER: '1',
    TMPDIR: runnerRoot
  };
  if (process.platform !== 'win32') return base;
  return {
    ...base,
    SystemRoot: process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows',
    SystemDrive: process.env.SystemDrive || 'C:',
    PATHEXT: process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD',
    ComSpec: process.env.ComSpec || 'cmd.exe',
    TEMP: runnerRoot,
    TMP: runnerRoot
  };
}

function spawnTestCommand(options) {
  const { shellCommand, workingDirectory, runnerRoot, timeoutMs, maxOutputBytes } = options;
  const { spawn } = require('child_process');
  const safeTimeoutMs = Math.max(1000, Math.min(Number(timeoutMs) || 30000, 120000));

  if (!String(shellCommand).match(/^[a-zA-Z0-9_./:\- ]+$/)) {
    throw new Error('Command contains invalid characters.');
  }

  const useWindowsShell = process.platform === 'win32';
  const shellExecutable = useWindowsShell ? (process.env.ComSpec || 'cmd.exe') : '/bin/sh';
  const shellArgs = useWindowsShell ? ['/d', '/s', '/c', shellCommand] : ['-c', shellCommand];

  return new Promise((resolve, reject) => {
    const child = spawn(shellExecutable, shellArgs, {
      cwd: workingDirectory,
      detached: process.platform !== 'win32',
      env: isolatedRunnerEnv(runnerRoot),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsVerbatimArguments: useWindowsShell
    });
    let stdout = ''; let stderr = ''; let truncated = false;
    const append = (target, chunk) => {
      const value = target + chunk.toString('utf8');
      if (Buffer.byteLength(value) > maxOutputBytes) { truncated = true; return value.slice(0, maxOutputBytes); }
      return value;
    };
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
    const timer = setTimeout(() => { terminateChild(child); reject(Object.assign(new Error(`Test command timed out after ${safeTimeoutMs}ms.`), { code: 'TEST_TIMEOUT' })); }, safeTimeoutMs);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ exitCode: code == null ? -1 : code, signal, stdout, stderr, truncated }); });
  });
}

async function runInSnapshot({ snapshot, command, timeoutMs = 30000, maxOutputBytes = 1024 * 1024, workspacePath }) {
  if (!String(command || '').trim()) throw new Error('A test command is required.');
  const shellCommand = assertAllowedTestCommand(command);
  const runnerRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'genos-test-run-'));
  const workingDirectory = path.join(runnerRoot, 'workspace');
  let cleanupWorktree = null;
  const materialization = 'manifest-copy';
  try {
    // The manifest captures dirty files as well as committed files. A detached
    // worktree would replay only the recorded commit and could silently omit
    // uncommitted state, so replay always uses the checksum-verified payload.
    await materialize(snapshot, workingDirectory);
    const output = await spawnTestCommand({ shellCommand, workingDirectory, runnerRoot, timeoutMs, maxOutputBytes });
    return { ...output, snapshotId: snapshot.id, snapshotHash: snapshot.snapshot_hash, materialization };
  } finally {
    if (cleanupWorktree) await cleanupWorktree();
    await fsp.rm(runnerRoot, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  isGitWorkspace,
  spawnGit,
  materializeGitWorktree,
  isAllowedTestCommand,
  assertAllowedTestCommand,
  runInSnapshot
};
