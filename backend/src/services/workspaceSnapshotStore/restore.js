const { getDatabase } = require('../../db');
async function restore({ db, workspace, reference, author = 'studio' }) {
  if (!workspace?.path) throw new Error('Workspace path is required for restore.');
  return withRestoreLock(workspace.path, () => restoreUnlocked({ db, workspace, reference, author }));
}

async function restoreUnlocked({ db, workspace, reference, author = 'studio' }) {
  const target = await getSnapshot(db, workspace.id, reference);
  const backup = await capture({ db, workspace, label: 'Pre-restore safety snapshot', reason: `Before restoring ${target.id}`, author });

  const staging = await fsp.mkdtemp(path.join(os.tmpdir(), 'genos-restore-'));
  const backupStaging = await fsp.mkdtemp(path.join(os.tmpdir(), 'genos-restore-backup-'));
  try {
    const verified = await materialize(target, staging);
    await materialize({ metadata: backup.metadata, snapshot_hash: backup.snapshotHash, id: backup.id, workspace_id: workspace.id, workspace_path: workspace.path }, backupStaging);
    await removeWorkspaceFiles(workspace.path);
    await copyMaterializedFiles(staging, verified.files, workspace.path);
    if (manifestHash(await collectFiles(workspace.path)) !== verified.hash) {
      throw new Error(`Snapshot restore checksum mismatch for ${workspace.path}.`);
    }
    return { success: true, restoredSnapshot: target, safetySnapshot: backup, strategy: 'manifest-copy' };
  } catch (error) {
    try {
      await removeWorkspaceFiles(workspace.path);
      const backupManifest = await readManifest({ metadata: backup.metadata, snapshot_hash: backup.snapshotHash, id: backup.id, workspace_id: workspace.id, workspace_path: workspace.path });
      await copyMaterializedFiles(backupStaging, backupManifest.files, workspace.path);
      if (manifestHash(await collectFiles(workspace.path)) !== backupManifest.hash) {
        throw new Error(`Safety snapshot checksum mismatch for ${workspace.path}.`);
      }
    } catch (rollbackError) {
      error.message += ` Recovery snapshot restore also failed: ${rollbackError.message}`;
    }
    throw error;
  } finally {
    await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
    await fsp.rm(backupStaging, { recursive: true, force: true }).catch(() => {});
  }
}

async function preview({ db, workspace, reference }) {
  const target = await getSnapshot(db, workspace.id, reference);
  const manifest = await readManifest(target);
  const current = await collectFiles(workspace.path);
  const currentByPath = new Map(current.map((file) => [file.path, file]));
  const targetByPath = new Map(manifest.files.map((file) => [file.path, file]));
  const affectedFiles = [...new Set([...currentByPath.keys(), ...targetByPath.keys()])].filter((file) => currentByPath.get(file)?.hash !== targetByPath.get(file)?.hash).sort();
  const reversePatch = affectedFiles.map((file) => {
    const from = currentByPath.get(file)?.hash || '<absent>';
    const to = targetByPath.get(file)?.hash || '<absent>';
    return `${file}\n  current: ${from}\n  restore: ${to}`;
  }).join('\n') || 'No file changes; restore is a no-op.';
  return { targetSnapshot: { ...target, metadata: parseMetadata(target.metadata) }, affectedFiles, reversePatch, affectedFilesCount: affectedFiles.length, durable: true };
}

// Commands executed inside snapshots run through a platform shell, so the
// input must be constrained to a fixed vocabulary of test commands. Anything
// else would be arbitrary remote code execution for the caller.
function isAllowedTestCommand(command) {
  return isAllowedSandboxTestCommand(command);
}

function assertAllowedTestCommand(command) {
  if (!isAllowedTestCommand(command)) {
    throw Object.assign(
      new Error(`Test command is not allowed.`),
      { code: 'TEST_COMMAND_NOT_ALLOWED' }
    );
  }
  return normalizeSandboxCommand(command);
}

async function runInSnapshot({ snapshot, command, timeoutMs = 30000, maxOutputBytes = 1024 * 1024, workspacePath }) {
  if (!String(command || '').trim()) throw new Error('A test command is required.');
  const shellCommand = assertAllowedTestCommand(command);
  const runnerRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'genos-test-run-'));
  const workingDirectory = path.join(runnerRoot, 'workspace');
  let cleanupWorktree = null;
  let materialization = 'manifest-copy';
  try {
    // The manifest captures dirty files as well as committed files. A detached
    // worktree would replay only the recorded commit and could silently omit
    // uncommitted state, so replay always uses the checksum-verified payload.
    await materialize(snapshot, workingDirectory);
    const { spawn } = require('child_process');
    // Use the platform shell so workspace test commands run identically on
    // Windows and POSIX hosts.
    const commandText = shellCommand;
    const useWindowsShell = process.platform === 'win32';
    const shellExecutable = useWindowsShell ? (process.env.ComSpec || 'cmd.exe') : '/bin/sh';
    const shellArgs = useWindowsShell ? ['/d', '/s', '/c', commandText] : ['-c', commandText];
    const output = await new Promise((resolve, reject) => {
      const child = spawn(shellExecutable, shellArgs, {
        cwd: workingDirectory,
        detached: process.platform !== 'win32',
        env: {
          PATH: process.env.PATH || '/usr/bin:/bin',
          CI: '1',
          GENOS_ISOLATED_RUNNER: '1',
          TMPDIR: runnerRoot,
          ...(process.platform === 'win32' ? {
            SystemRoot: process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows',
            SystemDrive: process.env.SystemDrive || 'C:',
            PATHEXT: process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD',
            ComSpec: process.env.ComSpec || 'cmd.exe',
            TEMP: runnerRoot,
            TMP: runnerRoot
          } : {})
        },
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
      const timer = setTimeout(() => { terminateChild(child); reject(Object.assign(new Error(`Test command timed out after ${timeoutMs}ms.`), { code: 'TEST_TIMEOUT' })); }, timeoutMs);
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('close', (code, signal) => { clearTimeout(timer); resolve({ exitCode: code == null ? -1 : code, signal, stdout, stderr, truncated }); });
    });
    return { ...output, snapshotId: snapshot.id, snapshotHash: snapshot.snapshot_hash, materialization };
  } finally {
    if (cleanupWorktree) await cleanupWorktree();
    await fsp.rm(runnerRoot, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { restore, restoreUnlocked, preview, runInSnapshot };