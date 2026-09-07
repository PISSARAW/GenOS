/**
 * Worktree lifecycle for isolated agent capsules.
 *
 * createIsolatedWorkspace() hands every agent a git worktree (or, for non-Git
 * sources, a plain copy). Those capsules used to outlive their agent forever,
 * so .genos-agent-worlds/ grew without bound. This service tracks which agent
 * runs on which disposable capsule and reclaims it once the runtime process
 * closes:
 *
 * - git worktree: `git worktree remove --force <path>` (then `worktree prune`)
 * - plain copy:   `fs.rm(path, { recursive: true, force: true })`
 *
 * Reclamation is delayed by GENOS_WORKTREE_GC_DELAY_MS (default 10 minutes)
 * so post-close consumers — evidence-aware merging, recovery dispatch, action
 * execution — can finish reading the capsule before it disappears. Setting
 * the variable to `0` reclaims immediately; `-1` disables reclamation.
 */
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { appendBounded } = require('./boundedOutput');
const { getDatabase } = require('../db');
const { terminateChild } = require('./processTermination');
const { normalizeRelativePath, resolveContainedPath } = require('./pathSafety');

const activeWorktrees = new Map();
const gitRepoMutexes = new Map();
const DEFAULT_GC_DELAY_MS = 10 * 60 * 1000;
const CLEANUP_RETRY_DELAY_MS = 30 * 1000;
const MAX_COPY_DEPTH = 32;
const MAX_COPY_ENTRIES = 100000;

async function withGitRepoLock(repoPath, fn) {
  const key = path.resolve(repoPath);
  let previous = gitRepoMutexes.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  gitRepoMutexes.set(key, previous.then(() => current, () => current));

  try {
    await previous;
    let attempts = 0;
    const maxAttempts = 5;
    while (attempts < maxAttempts) {
      try {
        return await fn();
      } catch (err) {
        attempts++;
        if (attempts < maxAttempts && /index\.lock|cannot lock ref/i.test(err.message || '')) {
          await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempts - 1)));
          continue;
        }
        throw err;
      }
    }
  } finally {
    release();
    if (gitRepoMutexes.get(key) === current) {
      gitRepoMutexes.delete(key);
    }
  }
}

async function ensureCleanupTable(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS agent_capsule_cleanup (
      agent_id TEXT PRIMARY KEY,
      workspace_root TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function gcDelayMs() {
  const configured = Number(process.env.GENOS_WORKTREE_GC_DELAY_MS);
  return Number.isFinite(configured) ? configured : DEFAULT_GC_DELAY_MS;
}

function spawnGit(cwd, args) {
  return runCommand('git', ['-C', cwd, ...args], { timeoutMs: 120000 });
}

/**
 * Free space under `directory`, or Infinity when the platform cannot report
 * it (fs.statfs is unavailable on some Windows/Node combinations and on
 * exotic mounts). Callers treat Infinity as "skip the disk-space guard"
 * rather than failing an otherwise valid launch.
 */
async function availableBytes(directory) {
  try {
    const stats = await fs.statfs(directory);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch (error) {
    if (!['ENOSYS', 'ENOTSUP', 'EPERM', 'EACCES'].includes(error.code)) throw error;
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Record that `agentId` runs inside the disposable capsule at
 * `workspaceRoot`. Only capsules created by createIsolatedWorkspace() may be
 * tracked — never a caller's real workspace.
 */
async function trackWorkspace(agentId, workspaceRoot) {
  if (!agentId || !workspaceRoot) return;
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  activeWorktrees.set(agentId, { workspaceRoot: resolvedWorkspaceRoot });
  const db = await getDatabase();
  await ensureCleanupTable(db);
  await db.run(
    'INSERT INTO agent_capsule_cleanup(agent_id, workspace_root) VALUES (?, ?) ON CONFLICT(agent_id) DO UPDATE SET workspace_root = excluded.workspace_root',
    agentId, resolvedWorkspaceRoot
  );
}

async function forgetWorkspace(agentId, cleanupDisk = false) {
  const tracked = activeWorktrees.get(agentId);
  activeWorktrees.delete(agentId);
  try {
    const db = await getDatabase();
    await ensureCleanupTable(db);
    const row = await db.get('SELECT workspace_root FROM agent_capsule_cleanup WHERE agent_id = ?', agentId);
    await db.run('DELETE FROM agent_capsule_cleanup WHERE agent_id = ?', agentId);
    const targetRoot = tracked?.workspaceRoot || row?.workspace_root;
    if (cleanupDisk && targetRoot) {
      await cleanupWorkspace(targetRoot, agentId);
    }
  } catch (_) {}
}

async function cleanupWorkspace(workspaceRoot, agentId = null) {
  const resolvedRoot = path.resolve(workspaceRoot || '');
  const filesystemRoot = path.parse(resolvedRoot).root;
  if (!workspaceRoot || resolvedRoot === filesystemRoot) throw new Error('Refusing to clean a filesystem root.');

  const configuredCapsuleRoot = process.env.GENOS_CAPSULE_ROOT ? path.resolve(process.env.GENOS_CAPSULE_ROOT) : null;
  const markers = new Set(['.genos-agent-worlds', '.genos-snapshot-worktrees', 'snapshot-worktrees', 'genos-snapshots']);
  let markerRoot = null;
  for (let current = resolvedRoot; current !== filesystemRoot; current = path.dirname(current)) {
    if (markers.has(path.basename(current))) { markerRoot = current; break; }
  }
  const relativeToConfigured = configuredCapsuleRoot ? path.relative(configuredCapsuleRoot, resolvedRoot) : null;
  const insideConfigured = configuredCapsuleRoot && relativeToConfigured !== '' && !relativeToConfigured.startsWith('..') && !path.isAbsolute(relativeToConfigured);
  if (!markerRoot && !insideConfigured) {
    throw new Error(`Refusing to clean workspace '${resolvedRoot}': not inside an allowed capsule directory.`);
  }

  if (agentId && (path.basename(agentId) !== agentId || path.basename(resolvedRoot) !== agentId)) {
    throw new Error(`Refusing to clean workspace '${resolvedRoot}' for agent '${agentId}'.`);
  }
  workspaceRoot = resolvedRoot;
  const marker = path.join(workspaceRoot, '.git');
  let removedVia = 'removed';
  let commonGitDir = null;
  try {
    if (fsSync.existsSync(marker) && fsSync.statSync(marker).isFile()) {
      try {
        const { stdout } = await runCommand('git', ['-C', workspaceRoot, 'rev-parse', '--path-format=absolute', '--git-common-dir']);
        if (stdout && stdout.trim()) {
           commonGitDir = stdout.trim();
        }
      } catch (_) {}

      const executionDir = commonGitDir ? path.dirname(commonGitDir) : process.cwd();
      await spawnGit(executionDir, ['worktree', 'remove', '--force', workspaceRoot]);
      removedVia = 'worktree-removed';
    }
  } catch (_) { /* fall through to the filesystem removal */ }
  await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
  if (agentId && path.basename(agentId) === agentId && !agentId.includes(path.sep)) {
    await fs.rm(path.join(path.dirname(workspaceRoot), '.genos-runtime', agentId), { recursive: true, force: true }).catch(() => {});
  }

  if (commonGitDir) {
    try {
      await runCommand('git', ['--git-dir', commonGitDir, 'worktree', 'prune'], { cwd: process.cwd() });
    } catch (_) {}
  } else {
    try {
      const parentDir = path.dirname(workspaceRoot);
      const match = workspaceRoot.match(/^(.*)[\/\\](\.genos-agent-worlds|\.genos-snapshot-worktrees|snapshot-worktrees|genos-snapshots)[\/\\]([^\/\\]+)[\/\\]/);
      const guessedRepo = match ? path.join(match[1], match[3]) : parentDir;
      if (fsSync.existsSync(path.join(guessedRepo, '.git'))) {
        await spawnGit(guessedRepo, ['worktree', 'prune']);
      }
    } catch (_) {}
  }

  return removedVia;
}

async function scheduleWorkspaceCleanup(agentId, forceDelay = null, retries = 0) {
  const tracked = activeWorktrees.get(agentId);
  if (!tracked || tracked.scheduled) return false;
  const delay = forceDelay !== null ? forceDelay : gcDelayMs();
  if (delay < 0) return false;
  tracked.scheduled = true;
  const reclaim = async () => {
    try {
      const via = await cleanupWorkspace(tracked.workspaceRoot, agentId);
      activeWorktrees.delete(agentId);
      const db = await getDatabase();
      await ensureCleanupTable(db);
      await db.run('DELETE FROM agent_capsule_cleanup WHERE agent_id = ?', agentId);
      return { agentId, workspaceRoot: tracked.workspaceRoot, via };
    } catch (_) {
      tracked.scheduled = false;
      if (retries < 3) {
        setTimeout(() => scheduleWorkspaceCleanup(agentId, CLEANUP_RETRY_DELAY_MS, retries + 1), CLEANUP_RETRY_DELAY_MS).unref();
      } else {
        // Keep the durable row and in-memory reference so a later reconciliation
        // can retry cleanup instead of losing the orphaned workspace forever.
        tracked.scheduled = false;
      }
      return { agentId, workspaceRoot: tracked.workspaceRoot, via: 'failed' };
    }
  };
  if (delay === 0) {
    reclaim().catch(() => {});
  } else {
    setTimeout(reclaim, delay).unref();
  }
  return true;
}

async function reconcileWorkspaceCleanup(db) {
  await ensureCleanupTable(db);
  const rows = await db.all('SELECT agent_id, workspace_root FROM agent_capsule_cleanup');
  for (const row of rows) {
    activeWorktrees.set(row.agent_id, { workspaceRoot: row.workspace_root });
    await scheduleWorkspaceCleanup(row.agent_id, 0);
  }
  return rows.length;
}

/** Diagnostics: every capsule currently tracked for eventual reclamation. */
function trackedWorkspaces() {
  return [...activeWorktrees.entries()].map(([agentId, tracked]) => ({ agentId, ...tracked }));
}

// ---------------------------------------------------------------------------
// Mission capsule provisioning
// ---------------------------------------------------------------------------

function runCommand(command, args, { cwd, input, timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const env = command === 'git'
      ? {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
        GIT_OPTIONAL_LOCKS: '0'
      }
      : process.env;
    const child = spawn(command, args, { cwd, env, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      terminateChild(child);
      reject(new Error(`${command} ${args.join(' ')} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout = appendBounded(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = appendBounded(stderr, chunk); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} ${args.join(' ')} failed: ${stderr.trim()}`)); });
    child.stdin.end(input || '');
  });
}

async function createIsolatedWorkspace(sourceRoot, workerId, capsuleRootOverride) {
  const source = path.resolve(sourceRoot);
  const normalizedWorkerId = normalizeRelativePath(String(workerId || ''), 'worker id');
  if (normalizedWorkerId.includes('/')) throw new Error('worker id must be a single safe path segment.');
  // Keep capsules beside (not inside) the source workspace: fs.cp rejects a
  // destination nested under its source and this also keeps the parent clean.
  const capsuleRoot = capsuleRootOverride || process.env.GENOS_CAPSULE_ROOT || path.join(path.dirname(source), '.genos-agent-worlds');
  if (capsuleRootOverride) {
    const resolvedOverride = path.resolve(capsuleRootOverride);
    const configuredRoot = process.env.GENOS_CAPSULE_ROOT ? path.resolve(process.env.GENOS_CAPSULE_ROOT) : null;
    const siblingRoot = path.resolve(path.dirname(source));
    const defaultWorldRoot = path.join(siblingRoot, '.genos-agent-worlds');
    if (resolvedOverride !== configuredRoot && resolvedOverride !== siblingRoot && resolvedOverride !== defaultWorldRoot) {
      throw new Error(`Capsule root '${resolvedOverride}' is outside the source workspace boundary.`);
    }
  }
  // An explicit root is already the mission capsule directory. Workers must
  // be its siblings: nesting them below the orchestrator source makes fs.cp
  // recursively copy a directory into itself for non-Git workspaces.
  const destination = capsuleRootOverride
    ? resolveContainedPath(capsuleRoot, normalizedWorkerId, 'capsule path')
    : resolveContainedPath(path.join(capsuleRoot, path.basename(source)), normalizedWorkerId, 'capsule path');
  await fs.mkdir(path.dirname(destination), { recursive: true });
  // Git worktrees share the object database and prevent a multi-gigabyte copy
  // of dependencies. Replay the tracked dirty diff so the capsule starts from
  // the caller's real working state without altering that source workspace.
  if (fsSync.existsSync(path.join(source, '.git'))) {
    const { stdout: indexEntries } = await runCommand('git', ['ls-files', '-s'], { cwd: source });
    if (indexEntries.split(/\r?\n/).some((entry) => entry.startsWith('120000 '))) {
      throw new Error(`Git workspace '${source}' contains tracked symlinks and cannot be sandboxed safely.`);
    }
  }
  try {
    const { stdout: gitTopLevel } = await runCommand('git', ['rev-parse', '--show-toplevel'], { cwd: source });
    if (path.resolve(gitTopLevel.trim()) !== source) {
      throw new Error(`Mission workspace ${source} is nested inside ${gitTopLevel.trim()}; copy only the mission scope.`);
    }
    let hasHead = true;
    try {
      await runCommand('git', ['rev-parse', '--verify', 'HEAD'], { cwd: source });
    } catch (_) {
      hasHead = false;
    }
    if (!hasHead) {
      throw new Error(`Git repository at ${source} has no commits yet; cannot create detached worktree.`);
    }
    const { stdout: diff } = await runCommand('git', ['diff', 'HEAD', '--binary'], { cwd: source });
    let worktreeCreated = false;
    await withGitRepoLock(source, async () => {
      await runCommand('git', ['worktree', 'add', '--detach', destination, 'HEAD'], { cwd: source });
    });
    worktreeCreated = true;
    if (diff && diff.trim()) {
      await runCommand('git', ['apply', '--whitespace=nowarn', '-'], { cwd: destination, input: diff });
    }
    const { stdout: untracked } = await runCommand('git', ['ls-files', '--others', '--exclude-standard'], { cwd: source });
    const untrackedFiles = untracked.split(/\r?\n/).filter(Boolean).map((file) => normalizeRelativePath(file, 'untracked file'));
    for (const file of untrackedFiles) {
      const srcPath = path.join(source, file);
      const destPath = path.join(destination, file);
      try {
        if ((await fs.lstat(srcPath)).isSymbolicLink()) continue;
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.cp(srcPath, destPath, { recursive: true });
      } catch (_) {}
    }
    return destination;
  } catch (gitError) {
    // Rollback partially initialized worktree to avoid orphaned registrations in .git/worktrees
    try {
      await runCommand('git', ['worktree', 'remove', '--force', destination], { cwd: source });
      await runCommand('git', ['worktree', 'prune'], { cwd: source });
    } catch (_) {}
    try {
      await fs.rm(destination, { recursive: true, force: true });
    } catch (_) {}
    // Non-Git workspaces retain the copy fallback below. A partially created
    // worktree is deliberately surfaced instead of silently copying into it.
    const destinationExists = await fs.access(destination).then(() => true, () => false);
    if (destinationExists) throw gitError;
  }
  // Capsules must never recursively copy previous capsules, build products, or
  // VCS metadata. They remain on disk for replay and evidence-aware merging.
  if (await availableBytes(path.dirname(destination)) < 1024 * 1024 * 1024) {
    throw new Error('Insufficient disk space for a non-Git isolated workspace; free at least 1 GiB or use a Git workspace.');
  }
  const excluded = new Set(['.git', '.genos', '.genos-agent-worlds', 'node_modules', 'target']);
  let copiedEntries = 0;
  try {
    await fs.cp(source, destination, {
      recursive: true,
      filter: (entry) => {
        try { if (require('fs').lstatSync(entry).isSymbolicLink()) return false; } catch (_) { return false; }
        if (excluded.has(path.basename(entry))) return false;
        const relative = path.relative(source, entry);
        const depth = relative ? relative.split(path.sep).length : 0;
        if (depth > MAX_COPY_DEPTH) throw new Error(`Workspace copy exceeds the ${MAX_COPY_DEPTH}-level depth limit.`);
        copiedEntries += 1;
        if (copiedEntries > MAX_COPY_ENTRIES) throw new Error(`Workspace copy exceeds the ${MAX_COPY_ENTRIES}-entry limit.`);
        return true;
      }
    });
  } catch (error) {
    await fs.rm(destination, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
  return destination;
}

async function provisionMissionWorkspace(mission, executionMode) {
  // An orchestrator is the authority boundary for a mission and must never
  // operate directly in the caller's workspace. Workers already receive a
  // capsule from their orchestrator, so preserve their assigned root.
  if (executionMode !== 'orchestrator' || mission.workspaceProvisioned === true) return mission;
  const sourceWorkspace = mission.workspaceRoot || process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
  const workspaceRoot = await createIsolatedWorkspace(sourceWorkspace, mission.agentId);
  return { ...mission, workspaceRoot, capsuleRoot: path.dirname(workspaceRoot) };
}

module.exports = {
  availableBytes,
  cleanupWorkspace,
  reconcileWorkspaceCleanup,
  createIsolatedWorkspace,
  forgetWorkspace,
  provisionMissionWorkspace,
  runCommand,
  scheduleWorkspaceCleanup,
  spawnGit,
  trackWorkspace,
  trackedWorkspaces
};
