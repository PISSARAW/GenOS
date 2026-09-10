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
 * execution — can finish reading the capsule before it disappears. A configured
 * `0` is clamped to a small floor (MIN_GC_DELAY_MS) so it cannot race live
 * readers; `-1` disables reclamation. GENOS_DISABLE_WORKSPACE_GC=1 disables
 * reclamation outright and is the documented escape hatch for tuning.
 *
 * Safety invariants added for delayed cleanup:
 * - Each capsule carries an epoch marker (EPOCH_MARKER_FILENAME) captured at
 *   scheduling time. A successor that reuses the deterministic path writes a
 *   fresh token, so a stale delayed cleanup skips instead of deleting it.
 * - A workspace is only `fs.rm`'d after a successful `git worktree remove`, or
 *   after the epoch above was explicitly re-validated; a failed worktree
 *   removal leaves the directory in place and returns a clear reason.
 * - .genos-runtime/<agentId> is left alone while the agent still has a live
 *   runtime (in-memory activeProcesses or agents.runtime_pid/status).
 *
 * Sensitive-material guards (SENSITIVE_BASENAME and removeSensitiveFiles) drop
 * .env, id_rsa, credentials and similar secrets from every capsule copy so a
 * sandbox never inherits the caller's keys.
 */
const { availableBytes } = require('./agentWorkspaceLifecycle/copy');
const { runCommand } = require('./agentWorkspaceLifecycle/git');
const {
  cleanupWorkspace,
  forgetWorkspace,
  reconcileWorkspaceCleanup,
  scheduleWorkspaceCleanup,
  trackWorkspace,
  trackedWorkspaces
} = require('./agentWorkspaceLifecycle/cleanup');
const {
  createIsolatedWorkspace,
  provisionMissionWorkspace
} = require('./agentWorkspaceLifecycle/provisioning');

module.exports = {
  availableBytes,
  cleanupWorkspace,
  reconcileWorkspaceCleanup,
  createIsolatedWorkspace,
  forgetWorkspace,
  provisionMissionWorkspace,
  runCommand,
  scheduleWorkspaceCleanup,
  trackWorkspace,
  trackedWorkspaces
};
