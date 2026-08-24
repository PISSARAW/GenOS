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

const activeWorktrees = new Map();
const DEFAULT_GC_DELAY_MS = 10 * 60 * 1000;

function gcDelayMs() {
  const configured = Number(process.env.GENOS_WORKTREE_GC_DELAY_MS);
  return Number.isFinite(configured) ? configured : DEFAULT_GC_DELAY_MS;
}

function spawnGit(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim() || `git ${args.join(' ')} exited with code ${code}`))));
  });
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
function trackWorkspace(agentId, workspaceRoot) {
  if (!agentId || !workspaceRoot) return;
  activeWorktrees.set(agentId, { workspaceRoot: path.resolve(workspaceRoot) });
}

function forgetWorkspace(agentId) {
  activeWorktrees.delete(agentId);
}

async function cleanupWorkspace(workspaceRoot) {
  const marker = path.join(workspaceRoot, '.git');
  let removedVia = 'removed';
  try {
    // Worktrees carry a .git FILE pointing at the parent repository; a plain
    // repo checkout has a .git DIRECTORY and must never be worktree-removed.
    if (fsSync.existsSync(marker) && fsSync.statSync(marker).isFile()) {
      await spawnGit(workspaceRoot, ['worktree', 'remove', '--force', workspaceRoot]);
      removedVia = 'worktree-removed';
    }
  } catch (_) { /* fall through to the filesystem removal */ }
  await fs.rm(workspaceRoot, { recursive: true, force: true });
  return removedVia;
}

function scheduleWorkspaceCleanup(agentId) {
  const tracked = activeWorktrees.get(agentId);
  if (!tracked || tracked.scheduled) return false;
  tracked.scheduled = true;
  const delay = gcDelayMs();
  if (delay < 0) return false;
  const reclaim = async () => {
    activeWorktrees.delete(agentId);
    try {
      const via = await cleanupWorkspace(tracked.workspaceRoot);
      return { agentId, workspaceRoot: tracked.workspaceRoot, via };
    } catch (_) {
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

/** Diagnostics: every capsule currently tracked for eventual reclamation. */
function trackedWorkspaces() {
  return [...activeWorktrees.entries()].map(([agentId, tracked]) => ({ agentId, ...tracked }));
}

// ---------------------------------------------------------------------------
// Mission capsule provisioning
// ---------------------------------------------------------------------------

function runCommand(command, args, { cwd, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} ${args.join(' ')} failed: ${stderr.trim()}`)));
    child.stdin.end(input || '');
  });
}

async function createIsolatedWorkspace(sourceRoot, workerId, capsuleRootOverride) {
  const source = path.resolve(sourceRoot);
  // Keep capsules beside (not inside) the source workspace: fs.cp rejects a
  // destination nested under its source and this also keeps the parent clean.
  const capsuleRoot = capsuleRootOverride || process.env.GENOS_CAPSULE_ROOT || path.join(path.dirname(source), '.genos-agent-worlds');
  // An explicit root is already the mission capsule directory. Workers must
  // be its siblings: nesting them below the orchestrator source makes fs.cp
  // recursively copy a directory into itself for non-Git workspaces.
  const destination = capsuleRootOverride
    ? path.join(capsuleRoot, workerId)
    : path.join(capsuleRoot, path.basename(source), workerId);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  // Git worktrees share the object database and prevent a multi-gigabyte copy
  // of dependencies. Replay the tracked dirty diff so the capsule starts from
  // the caller's real working state without altering that source workspace.
  try {
    const { stdout: gitTopLevel } = await runCommand('git', ['rev-parse', '--show-toplevel'], { cwd: source });
    if (path.resolve(gitTopLevel.trim()) !== source) {
      throw new Error(`Mission workspace ${source} is nested inside ${gitTopLevel.trim()}; copy only the mission scope.`);
    }
    const { stdout: diff } = await runCommand('git', ['diff', '--binary'], { cwd: source });
    await runCommand('git', ['worktree', 'add', '--detach', destination, 'HEAD'], { cwd: source });
    if (diff) await runCommand('git', ['apply', '--whitespace=nowarn', '-'], { cwd: destination, input: diff });
    return destination;
  } catch (gitError) {
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
  const excluded = new Set(['.git', '.genos', 'node_modules', 'target']);
  await fs.cp(source, destination, {
    recursive: true,
    filter: (entry) => !excluded.has(path.basename(entry))
  });
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
  createIsolatedWorkspace,
  forgetWorkspace,
  provisionMissionWorkspace,
  runCommand,
  scheduleWorkspaceCleanup,
  spawnGit,
  trackWorkspace,
  trackedWorkspaces
};
