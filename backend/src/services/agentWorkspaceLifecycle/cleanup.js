const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { spawnGit } = require('../../utils/fs');
const { getDatabase } = require('../../db');
const { runCommand, withGitRepoLock } = require('./git');
const { bestEffort } = require('./support');
const { CLEANUP_RETRY_DELAY_MS, RUNTIME_DIR_NAME, gcDelayMs } = require('./constants');
const { ensureEpochMarker, readEpochMarker, isAgentRuntimeAlive } = require('./epoch');

const activeWorktrees = new Map();

async function ensureCleanupTable(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS agent_capsule_cleanup (
      agent_id TEXT PRIMARY KEY,
      workspace_root TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function capsuleMarkerRoot(resolvedRoot, filesystemRoot) {
  const markers = new Set(['.genos-agent-worlds', '.genos-snapshot-worktrees', 'snapshot-worktrees', 'genos-snapshots']);
  let current = resolvedRoot;
  while (current !== filesystemRoot) {
    if (markers.has(path.basename(current))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function isInsideConfiguredCapsule(resolvedRoot, configuredCapsuleRoot) {
  if (!configuredCapsuleRoot) return false;
  const relative = path.relative(configuredCapsuleRoot, resolvedRoot);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function assertSafeCapsuleRoot(resolvedRoot) {
  const filesystemRoot = path.parse(resolvedRoot).root;
  if (!resolvedRoot || resolvedRoot === filesystemRoot) throw new Error('Refusing to clean a filesystem root.');
  const configuredCapsuleRoot = process.env.GENOS_CAPSULE_ROOT ? path.resolve(process.env.GENOS_CAPSULE_ROOT) : null;
  if (capsuleMarkerRoot(resolvedRoot, filesystemRoot)) return;
  if (isInsideConfiguredCapsule(resolvedRoot, configuredCapsuleRoot)) return;
  throw new Error(`Refusing to clean workspace '${resolvedRoot}': not inside an allowed capsule directory.`);
}

function assertAgentOwnership(resolvedRoot, agentId) {
  if (!agentId) return;
  const base = path.basename(resolvedRoot);
  const safeId = path.basename(agentId) === agentId;
  if (safeId && (base === agentId || base.startsWith(`${agentId}_`))) return;
  throw new Error(`Refusing to clean workspace '${resolvedRoot}' for agent '${agentId}'.`);
}

/**
 * Record that `agentId` runs inside the disposable capsule at
 * `workspaceRoot`. Only capsules created by createIsolatedWorkspace() may be
 * tracked — never a caller's real workspace. The epoch marker is written here
 * (or captured when a legacy capsule already owns one).
 */
async function trackWorkspace(agentId, workspaceRoot) {
  if (!agentId || !workspaceRoot) return;
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const epoch = await ensureEpochMarker(resolvedWorkspaceRoot);
  activeWorktrees.set(agentId, { workspaceRoot: resolvedWorkspaceRoot, epoch });
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
      const options = tracked?.epoch ? { expectedEpoch: tracked.epoch } : {};
      await cleanupWorkspace(targetRoot, agentId, options);
    }
  } catch (_) {
    // Forgetting is best-effort: a missing row must never block the caller.
  }
}

async function cleanupRuntimeDir(resolvedRoot, agentId) {
  if (!agentId || path.basename(agentId) !== agentId || agentId.includes(path.sep)) return;
  if (await isAgentRuntimeAlive(agentId)) return;
  await fs.rm(path.join(path.dirname(resolvedRoot), RUNTIME_DIR_NAME, agentId), { recursive: true, force: true });
}

function isWorktreeRoot(resolvedRoot) {
  try {
    const marker = path.join(resolvedRoot, '.git');
    return fsSync.existsSync(marker) && fsSync.statSync(marker).isFile();
  } catch (_) {
    return false;
  }
}

async function gitCommonDir(workspaceRoot) {
  try {
    const { stdout } = await runCommand('git', ['-C', workspaceRoot, 'rev-parse', '--path-format=absolute', '--git-common-dir']);
    return stdout && stdout.trim() ? stdout.trim() : null;
  } catch (_) {
    return null;
  }
}

async function removeWorktreeIfPresent(resolvedRoot) {
  const base = { root: resolvedRoot, removed: false, wasWorktree: false, failed: false, commonGitDir: null };
  if (!isWorktreeRoot(resolvedRoot)) return base;
  const commonGitDir = await gitCommonDir(resolvedRoot);
  try {
    const executionDir = commonGitDir ? path.dirname(commonGitDir) : process.cwd();
    await withGitRepoLock(executionDir, async () => {
      await spawnGit(executionDir, ['worktree', 'remove', '--force', resolvedRoot]);
    });
    return { ...base, removed: true, wasWorktree: true, commonGitDir };
  } catch (_) {
    return { ...base, failed: true, wasWorktree: true, commonGitDir };
  }
}

async function pruneByCommonDir(commonGitDir) {
  const repoDir = path.dirname(commonGitDir);
  await withGitRepoLock(repoDir, async () => {
    await runCommand('git', ['--git-dir', commonGitDir, 'worktree', 'prune'], { cwd: process.cwd() });
  });
}

async function pruneGuessedRepo(workspaceRoot) {
  const parentDir = path.dirname(workspaceRoot);
  const match = workspaceRoot.match(/^(.*)[\/\\](\.genos-agent-worlds|\.genos-snapshot-worktrees|snapshot-worktrees|genos-snapshots)[\/\\]([^\/\\]+)[\/\\]/);
  const guessedRepo = match ? path.join(match[1], match[3]) : parentDir;
  if (!fsSync.existsSync(path.join(guessedRepo, '.git'))) return;
  await withGitRepoLock(guessedRepo, async () => {
    await spawnGit(guessedRepo, ['worktree', 'prune']);
  });
}

async function pruneWorktree(worktree) {
  if (!worktree || !worktree.root) return;
  if (worktree.commonGitDir) {
    await pruneByCommonDir(worktree.commonGitDir);
    return;
  }
  await pruneGuessedRepo(worktree.root);
}

/**
 * Reclaim a disposable capsule.
 *
 * `options.expectedEpoch` is the ownership token captured when cleanup was
 * scheduled. When supplied it is re-validated against the on-disk marker
 * BEFORE any removal: a successor that reused the deterministic path has
 * written a new token, so this returns 'epoch-mismatch' and leaves the
 * successor's capsule untouched. A failed `git worktree remove` also stops the
 * filesystem removal unless the epoch was explicitly re-validated above.
 */
async function cleanupWorkspace(workspaceRoot, agentId = null, options = {}) {
  const resolvedRoot = path.resolve(workspaceRoot || '');
  assertSafeCapsuleRoot(resolvedRoot);
  assertAgentOwnership(resolvedRoot, agentId);
  const expectedEpoch = options.expectedEpoch;
  if (expectedEpoch) {
    const currentEpoch = await readEpochMarker(resolvedRoot);
    if (currentEpoch !== expectedEpoch) return 'epoch-mismatch';
  }
  const worktree = await removeWorktreeIfPresent(resolvedRoot);
  if (worktree.failed && !expectedEpoch) return 'worktree-remove-failed';
  await bestEffort(fs.rm(resolvedRoot, { recursive: true, force: true }));
  await bestEffort(cleanupRuntimeDir(resolvedRoot, agentId));
  await bestEffort(pruneWorktree(worktree));
  return worktree.removed ? 'worktree-removed' : 'removed';
}

function createReclaimer(agentId, tracked, retries) {
  return async () => {
    try {
      const via = await cleanupWorkspace(tracked.workspaceRoot, agentId, { expectedEpoch: tracked.epoch });
      if (via === 'epoch-mismatch' || via === 'worktree-remove-failed') {
        tracked.scheduled = false;
        return { agentId, workspaceRoot: tracked.workspaceRoot, via };
      }
      activeWorktrees.delete(agentId);
      const db = await getDatabase();
      await ensureCleanupTable(db);
      await db.run('DELETE FROM agent_capsule_cleanup WHERE agent_id = ?', agentId);
      return { agentId, workspaceRoot: tracked.workspaceRoot, via };
    } catch (_) {
      tracked.scheduled = false;
      if (retries < 3) {
        setTimeout(() => scheduleWorkspaceCleanup(agentId, CLEANUP_RETRY_DELAY_MS, retries + 1), CLEANUP_RETRY_DELAY_MS).unref();
      }
      return { agentId, workspaceRoot: tracked.workspaceRoot, via: 'failed' };
    }
  };
}

async function scheduleWorkspaceCleanup(agentId, forceDelay = null, retries = 0) {
  const tracked = activeWorktrees.get(agentId);
  if (!tracked || tracked.scheduled) return false;
  const delay = forceDelay !== null ? forceDelay : gcDelayMs();
  if (delay < 0) return false;
  tracked.scheduled = true;
  const reclaim = createReclaimer(agentId, tracked, retries);
  if (delay === 0) bestEffort(reclaim());
  else setTimeout(reclaim, delay).unref();
  return true;
}

async function reconcileWorkspaceCleanup(db) {
  await ensureCleanupTable(db);
  const rows = await db.all('SELECT agent_id, workspace_root FROM agent_capsule_cleanup');
  for (const row of rows) {
    const epoch = await ensureEpochMarker(row.workspace_root);
    activeWorktrees.set(row.agent_id, { workspaceRoot: row.workspace_root, epoch });
    await scheduleWorkspaceCleanup(row.agent_id, 0);
  }
  return rows.length;
}

/** Diagnostics: every capsule currently tracked for eventual reclamation. */
function trackedWorkspaces() {
  return [...activeWorktrees.entries()].map(([agentId, tracked]) => ({ agentId, ...tracked }));
}

module.exports = {
  activeWorktrees,
  ensureCleanupTable,
  trackWorkspace,
  forgetWorkspace,
  cleanupWorkspace,
  scheduleWorkspaceCleanup,
  reconcileWorkspaceCleanup,
  trackedWorkspaces
};
