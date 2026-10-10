const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { spawnGit } = require('../../utils/fs');
const { runCommand, withGitRepoLock } = require('./git');
const { bestEffort } = require('./support');
const { CLEANUP_RETRY_DELAY_MS, RUNTIME_DIR_NAME, gcDelayMs } = require('./constants');
const { ensureEpochMarker, readEpochMarker, isAgentRuntimeAlive, isProcessAlive } = require('./epoch');
const { getDatabase } = require('../../db');

const activeWorktrees = new Map();

async function ensureCleanupTable(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS agent_capsule_cleanup (
      agent_id TEXT PRIMARY KEY,
      workspace_root TEXT NOT NULL,
      epoch TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const columns = await db.all('PRAGMA table_info(agent_capsule_cleanup)');
  if (!columns.some((column) => column.name === 'epoch')) {
    await db.exec('ALTER TABLE agent_capsule_cleanup ADD COLUMN epoch TEXT');
  }
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
  const db = await require('../../db').getDatabase();
  await ensureCleanupTable(db);
  await db.run(
    'INSERT INTO agent_capsule_cleanup(agent_id, workspace_root, epoch) VALUES (?, ?, ?) ON CONFLICT(agent_id) DO UPDATE SET workspace_root = excluded.workspace_root, epoch = excluded.epoch',
    agentId, resolvedWorkspaceRoot, epoch
  );
}

async function forgetWorkspace(agentId, cleanupDisk = false) {
  const tracked = activeWorktrees.get(agentId);
  try {
    const db = await getDatabase();
    await ensureCleanupTable(db);
    const row = await db.get('SELECT workspace_root, epoch FROM agent_capsule_cleanup WHERE agent_id = ?', agentId);
    const targetRoot = tracked?.workspaceRoot || row?.workspace_root;
    if (cleanupDisk && targetRoot) {
      const expectedEpoch = tracked?.epoch || row?.epoch;
      if (!expectedEpoch) return;
      const options = { expectedEpoch };
      const outcome = await cleanupWorkspace(targetRoot, agentId, options);
      if (outcome !== 'removed' && outcome !== 'worktree-removed') return;
    }
    activeWorktrees.delete(agentId);
    await db.run('DELETE FROM agent_capsule_cleanup WHERE agent_id = ?', agentId);
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

async function removeWorktreeIfPresent(resolvedRoot, beforeRemove) {
  const base = { root: resolvedRoot, removed: false, wasWorktree: false, failed: false, commonGitDir: null };
  if (!isWorktreeRoot(resolvedRoot)) return base;
  const commonGitDir = await gitCommonDir(resolvedRoot);
  try {
    const executionDir = commonGitDir ? path.dirname(commonGitDir) : process.cwd();
    const guard = await withGitRepoLock(executionDir, async () => {
      const reason = await beforeRemove();
      if (reason) return reason;
      await spawnGit(executionDir, ['worktree', 'remove', '--force', resolvedRoot]);
      return null;
    });
    if (guard) return { ...base, guard, wasWorktree: true, commonGitDir };
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

async function rollbackEligibility({ db, agentId, root, epoch, targetId }) {
  const tracked = activeWorktrees.get(agentId);
  if (!tracked || tracked.workspaceRoot !== root || tracked.epoch !== epoch) return 'owner-changed';
  if (!await ownsTrackedCapsule(db, agentId, tracked)) return 'owner-changed';
  const row = await db.get('SELECT status, runtime_pid FROM agents WHERE id = ?', targetId);
  const { activeProcesses } = require('../agentOrchestrationState');
  if (!row || row.status !== 'running') return 'agent-not-reserved';
  if (row.runtime_pid || activeProcesses.has(targetId)) return 'runtime-alive';
  return null;
}

async function cleanupEligibility({ db, agentId, root, epoch, rollbackTargetId }) {
  if (epoch && await readEpochMarker(root) !== epoch) return 'epoch-mismatch';
  if (!agentId) return null;
  if (rollbackTargetId) return rollbackEligibility({ db, agentId, root, epoch, targetId: rollbackTargetId });
  const row = await db.get('SELECT status, runtime_pid FROM agents WHERE id = ?', agentId);
  const { activeProcesses, TERMINAL_AGENT_STATUSES } = require('../agentOrchestrationState');
  if (!row || !TERMINAL_AGENT_STATUSES.has(row.status)) return 'agent-not-terminal';
  if (activeProcesses.has(agentId) || isProcessAlive(row.runtime_pid)) return 'runtime-alive';
  return null;
}

async function ownsTrackedCapsule(db, agentId, tracked) {
  if (activeWorktrees.get(agentId) !== tracked) return false;
  const row = await db.get('SELECT workspace_root, epoch FROM agent_capsule_cleanup WHERE agent_id = ?', agentId);
  return row?.workspace_root === tracked.workspaceRoot && row.epoch === tracked.epoch;
}

async function removeEligibleCapsule(context) {
  const { root, agentId, db, epoch, rollbackTargetId } = context;
  const recheck = () => cleanupEligibility({ db, agentId, root, epoch, rollbackTargetId });
  const beforeRemoval = await recheck();
  if (beforeRemoval) return beforeRemoval;
  const worktree = await removeWorktreeIfPresent(root, recheck);
  if (worktree.guard) return worktree.guard;
  if (worktree.failed) return 'worktree-remove-failed';
  if (fsSync.existsSync(root)) {
    const reason = await recheck();
    if (reason) return reason;
    await fs.rm(root, { recursive: true, force: true });
  }
  await bestEffort(cleanupRuntimeDir(root, agentId));
  await bestEffort(pruneWorktree(worktree));
  return worktree.removed ? 'worktree-removed' : 'removed';
}

async function cleanupEpoch({ db, agentId, root, expectedEpoch }) {
  if (!agentId) return { epoch: expectedEpoch || null };
  await ensureCleanupTable(db);
  const row = await db.get('SELECT workspace_root, epoch FROM agent_capsule_cleanup WHERE agent_id = ?', agentId);
  if (row) {
    if (row.workspace_root !== root || !row.epoch) return { reason: 'owner-changed' };
    if (expectedEpoch && expectedEpoch !== row.epoch) return { reason: 'epoch-mismatch' };
    return { epoch: row.epoch };
  }
  if (activeWorktrees.has(agentId)) return { reason: 'owner-changed' };
  return { epoch: expectedEpoch || await readEpochMarker(root) };
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
  const db = agentId ? (options.db || await getDatabase()) : null;
  const resolvedEpoch = await cleanupEpoch({ db, agentId, root: resolvedRoot, expectedEpoch: options.expectedEpoch });
  if (resolvedEpoch.reason) return resolvedEpoch.reason;
  const expectedEpoch = resolvedEpoch.epoch;
  if (agentId && !expectedEpoch) return 'epoch-mismatch';
  const rollbackTargetId = options.rollbackUnlaunched;
  const eligibility = await cleanupEligibility({ db, agentId, root: resolvedRoot, epoch: expectedEpoch, rollbackTargetId });
  if (eligibility) return eligibility;
  return removeEligibleCapsule({ root: resolvedRoot, agentId, db, epoch: expectedEpoch, rollbackTargetId });
}

function createReclaimer(agentId, tracked, retries) {
  return async () => {
    try {
      const db = await getDatabase();
      if (!await ownsTrackedCapsule(db, agentId, tracked)) return { agentId, via: 'owner-changed' };
      if (await require('../garageCapsuleRetention').retained(db, agentId)) {
        tracked.scheduled = false;
        setTimeout(() => scheduleWorkspaceCleanup(agentId, 0, retries), CLEANUP_RETRY_DELAY_MS).unref();
        return { agentId, workspaceRoot: tracked.workspaceRoot, via: 'garage-capture-pending' };
      }
      const via = await cleanupWorkspace(tracked.workspaceRoot, agentId, { expectedEpoch: tracked.epoch, db });
      if (via !== 'removed' && via !== 'worktree-removed') {
        tracked.scheduled = false;
        return { agentId, workspaceRoot: tracked.workspaceRoot, via };
      }
      if (!await ownsTrackedCapsule(db, agentId, tracked)) return { agentId, via: 'owner-changed' };
      activeWorktrees.delete(agentId);
      await ensureCleanupTable(db);
      await db.run('DELETE FROM agent_capsule_cleanup WHERE agent_id = ? AND workspace_root = ? AND epoch = ?',
        agentId, tracked.workspaceRoot, tracked.epoch);
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
  const db = await getDatabase();
  if (!await ownsTrackedCapsule(db, agentId, tracked)) return false;
  const eligibility = await cleanupEligibility({ db, agentId, root: tracked.workspaceRoot, epoch: tracked.epoch });
  if (eligibility) return false;
  try {
    await require('../gqwf/workers').captureWorker(db, agentId);
  } catch (error) {
    console.error(`[GQWF] Worker ${agentId} candidate capture failed:`, error);
    return false;
  }
  tracked.scheduled = true;
  const reclaim = createReclaimer(agentId, tracked, retries);
  if (delay === 0) bestEffort(reclaim());
  else setTimeout(reclaim, delay).unref();
  return true;
}

async function reconcileWorkspaceCleanup(db) {
  await ensureCleanupTable(db);
  const rows = await db.all('SELECT agent_id, workspace_root, epoch FROM agent_capsule_cleanup');
  let reconciled = 0;
  for (const row of rows) {
    // A capsule whose directory has already been reclaimed (e.g. OS temp purge,
    // manual cleanup, or a crash mid-reclaim) must not crash the boot: skip it
    // and drop the stale tracking row instead of attempting to write an epoch
    // marker into a path that no longer exists.
    if (!row.workspace_root || !fsSync.existsSync(row.workspace_root)) {
      await bestEffort(db.run('DELETE FROM agent_capsule_cleanup WHERE agent_id = ?', row.agent_id));
      continue;
    }
    if (!row.epoch || await readEpochMarker(row.workspace_root) !== row.epoch) continue;
    activeWorktrees.set(row.agent_id, { workspaceRoot: row.workspace_root, epoch: row.epoch });
    if (await scheduleWorkspaceCleanup(row.agent_id, 0)) reconciled += 1;
  }
  return reconciled;
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
