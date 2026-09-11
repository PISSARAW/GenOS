/**
 * Bisection auto-remediation: restore the latest verified-healthy snapshot.
 */
const { bisectAnomalyAsync } = require('./bisectionSearch');
const { knownHealth } = require('./bisectionHistory');

const MAX_BISECTION_SNAPSHOTS = 10000;

function healthyRefOf(report) {
  const healthy = report.lastHealthy || null;
  if (!healthy) return { healthy: null, ref: null };
  if (healthy.snapshotHash != null) return { healthy, ref: healthy.snapshotHash };
  if (healthy.snapshotId != null) return { healthy, ref: healthy.snapshotId };
  return { healthy, ref: healthy.stepNumber != null ? healthy.stepNumber : null };
}

function resolveHealthyReference(culpritReport) {
  const { healthy, ref } = healthyRefOf(culpritReport);
  if (ref == null) {
    throw new Error('No verified-healthy snapshot precedes the culprit; refusing to restore the failing snapshot. Re-run bisection with a healthy baseline.');
  }
  const culpritRef = healthyRefOf({ lastHealthy: culpritReport }).ref;
  if (culpritRef != null && String(ref) === String(culpritRef)) {
    throw new Error('Refusing rollback: the restore target matches the failing culprit snapshot.');
  }
  return { healthy, ref };
}

async function loadBisectWorkspace(db, workspaceId) {
  const workspace = await db.get('SELECT * FROM workspaces WHERE id = ?', workspaceId);
  if (!workspace) throw new Error(`Workspace '${workspaceId}' not found for causal rollback.`);
  return workspace;
}

async function restoreHealthySnapshot(job) {
  const snapshotStore = require('./workspaceSnapshotStore');
  const preview = await snapshotStore.preview({ db: job.db, workspace: job.workspace, reference: job.ref });
  const restored = await snapshotStore.restore({ db: job.db, workspace: job.workspace, reference: job.ref, author: 'causal-bisection' });
  const culpritFile = job.report.targetFile || preview.affectedFiles[0] || null;
  return {
    success: true,
    remediated: true,
    workspaceId: job.workspace.id,
    rolledBackCulpritStep: job.report.stepNumber,
    restoredFromHealthyStep: job.healthy.stepNumber ?? null,
    restoredFromHealthyHash: job.healthy.snapshotHash ?? job.healthy.snapshotId ?? null,
    rollbackSnapshotHash: restored.restoredSnapshot.snapshot_hash,
    executedAt: new Date().toISOString(),
    remediationPatch: {
      file: culpritFile,
      patchType: 'DURABLE_SNAPSHOT_RESTORE',
      preservedAgentFiles: preview.affectedFiles.filter((file) => file !== culpritFile),
      restoredInvariants: ['Snapshot manifest checksum verified']
    },
    affectedFilesCount: preview.affectedFilesCount,
    unaffectedParallelFilesPreserved: Math.max(0, (preview.targetSnapshot.file_count || 0) - preview.affectedFilesCount),
    safetySnapshotId: restored.safetySnapshot.id,
    message: 'Durable snapshot restore to the latest verified-healthy snapshot completed with checksum verification.'
  };
}

async function remediateRollback(db, workspaceId, culpritReport = {}) {
  if (!db || typeof db.get !== 'function') throw new Error('A database handle is required for causal rollback.');
  const workspace = await loadBisectWorkspace(db, workspaceId);
  const { healthy, ref } = resolveHealthyReference(culpritReport);
  return restoreHealthySnapshot({ db, workspace, report: culpritReport, healthy, ref });
}

async function querySnapshotHistory(db, workspaceId) {
  try {
    return await db.all(
      'SELECT * FROM workspace_snapshots WHERE workspace_id = ? ORDER BY step_number ASC LIMIT ?',
      workspaceId,
      MAX_BISECTION_SNAPSHOTS + 1
    );
  } catch (_) {
    return [];
  }
}

async function loadWorkspaceOrNull(db, workspaceId) {
  try {
    return await db.get('SELECT * FROM workspaces WHERE id = ?', workspaceId);
  } catch (_) {
    return null;
  }
}

async function loadBisectInputs(db, options) {
  if (Array.isArray(options.snapshotHistory)) return { history: [...options.snapshotHistory], workspace: null };
  if (!db || !options.workspaceId) return { history: null, workspace: null };
  const history = await querySnapshotHistory(db, options.workspaceId);
  const workspace = await loadWorkspaceOrNull(db, options.workspaceId);
  return { history, workspace };
}

function snapshotIsDurable(snap) {
  try {
    const meta = typeof snap.metadata === 'string' ? JSON.parse(snap.metadata || '{}') : (snap.metadata || {});
    return meta.storage === 'durable-filesystem';
  } catch (_) {
    return false;
  }
}

function historyIsDurable(history) {
  return history.some((snap) => snapshotIsDurable(snap));
}

function resolveWorkspacePath(workspaceRoot, workspace) {
  if (workspaceRoot) return workspaceRoot;
  if (workspace && workspace.path) return workspace.path;
  return process.cwd();
}

function makeCommandProbe(snapshotStore, setup, executionResults) {
  return async (snap) => {
    const execution = await snapshotStore.runInSnapshot({
      snapshot: snap,
      command: setup.command,
      timeoutMs: setup.timeoutMs,
      workspacePath: setup.workspacePath
    });
    executionResults.set(snap, execution);
    return execution.exitCode === 0;
  };
}

function fallbackProbe(snap) {
  if (snap._execution) return snap._execution.exitCode === 0;
  const health = knownHealth(snap);
  if (health !== null) return health;
  if (snap.status === 'failed' || snap.status === 'error') return false;
  return null;
}

function buildFailurePredicate(history, setup, executionResults) {
  if (!historyIsDurable(history)) return fallbackProbe;
  try {
    const snapshotStore = require('./workspaceSnapshotStore');
    return makeCommandProbe(snapshotStore, setup, executionResults);
  } catch (_) {
    return fallbackProbe;
  }
}

async function maybeAutoRemediate(db, options, result) {
  if (result.anomalyFound && options.autoRollback && db && options.workspaceId) {
    try {
      return await remediateRollback(db, options.workspaceId || 'workspace_recovery', result.culpritReport);
    } catch (error) {
      return { success: false, remediated: false, reason: error.message };
    }
  }
  if (result.anomalyFound && options.autoRollback) {
    return { success: false, remediated: false, reason: 'Durable rollback requires a database-backed workspace.' };
  }
  return null;
}

function historyExceedsLimit(history) {
  return history && history.length > MAX_BISECTION_SNAPSHOTS;
}

function historyTooShort(history) {
  return !history || history.length < 2;
}

async function autoBisectWorkspaceAnomaly(db, options = {}) {
  const {
    workspaceId,
    workspaceRoot,
    testCommand = 'npm test',
    timeoutMs = 30000,
    autoRollback = true
  } = options;
  const inputs = await loadBisectInputs(db, options);
  const history = inputs.history;
  if (historyExceedsLimit(history)) {
    return {
      bisectionComplete: false,
      anomalyFound: false,
      totalSnapshotsSearched: history.length,
      reason: `Snapshot history exceeds the ${MAX_BISECTION_SNAPSHOTS}-snapshot bisection limit.`
    };
  }
  if (historyTooShort(history)) {
    return {
      bisectionComplete: false,
      anomalyFound: false,
      totalSnapshotsSearched: history ? history.length : 0,
      reason: 'Insufficient snapshots for bisection (at least 2 required).'
    };
  }
  const executionResults = new Map();
  const workspacePath = resolveWorkspacePath(workspaceRoot, inputs.workspace);
  const predicate = options.predicate || buildFailurePredicate(history, { command: testCommand, timeoutMs, workspacePath }, executionResults);
  const bisectionResult = await bisectAnomalyAsync(history, predicate, { executionResults, predicateRetries: options.predicateRetries });
  const remediation = await maybeAutoRemediate(db, { autoRollback, workspaceId }, bisectionResult);
  return {
    ...bisectionResult,
    remediation
  };
}

module.exports = {
  MAX_BISECTION_SNAPSHOTS,
  remediateRollback,
  autoBisectWorkspaceAnomaly
};
