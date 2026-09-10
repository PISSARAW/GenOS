/**
 * GenOS Workspace & Causal Bisection Service
 * Multi-branch temporal diffing, O(log N) causal bisection, and atomic invariant-preserving rollback.
 */

const MAX_BISECTION_SNAPSHOTS = 10000;

function knownHealth(snapshot) {
  if (typeof snapshot.healthy === 'boolean') return snapshot.healthy;
  if (snapshot.metadata) {
    try {
      const metadata = typeof snapshot.metadata === 'string' ? JSON.parse(snapshot.metadata) : snapshot.metadata;
      if (typeof metadata.healthy === 'boolean') return metadata.healthy;
    } catch (_) {}
  }
  return null;
}

function monotonicityViolation(history) {
  let sawFailure = false;
  for (const snapshot of history) {
    const health = knownHealth(snapshot);
    if (health === null) return false;
    if (!health) sawFailure = true;
    if (sawFailure && health) return true;
  }
  return false;
}

/**
 * Computes multi-branch temporal tree diff across workspaces or snapshots
 */
function diffWorkspaces(baseWorkspace = 'main', targetWorkspace = 'feature-branch', options = {}) {
  const entries = options.diffEntries || [];
  if (!Array.isArray(entries)) throw new TypeError('diffEntries must be an array.');
  const fileCounts = new Map();
  for (const entry of entries) {
    const file = String(entry.file || 'unknown');
    fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
  }
  const diffEntries = entries.map((entry) => {
    const additions = entry.additions == null ? 0 : Number(entry.additions);
    const deletions = entry.deletions == null ? 0 : Number(entry.deletions);
    if (!Number.isFinite(additions) || additions < 0 || !Number.isFinite(deletions) || deletions < 0) {
      throw new TypeError(`Diff counts must be non-negative numbers for '${entry.file || 'unknown'}'.`);
    }
    const file = String(entry.file || 'unknown');
    return {
      ...entry,
      file,
      additions,
      deletions,
      collisionRisk: fileCounts.get(file) > 1 ? 'HIGH' : (entry.collisionRisk || 'UNKNOWN')
    };
  });

  return {
    baseBranch: baseWorkspace,
    targetBranch: targetWorkspace,
    diffGeneratedAt: new Date().toISOString(),
    totalFilesChanged: new Set(diffEntries.map((entry) => entry.file)).size,
    totalAdditions: diffEntries.reduce((acc, d) => acc + d.additions, 0),
    totalDeletions: diffEntries.reduce((acc, d) => acc + d.deletions, 0),
    categories: {
      syntaxAdditions: diffEntries.filter(d => d.category === 'Syntax Additions').length,
      refactorings: diffEntries.filter(d => d.category === 'Refactorings').length,
      breakingApiChanges: diffEntries.filter(d => d.category === 'Breaking API Changes').length,
      documentation: diffEntries.filter(d => d.category === 'Documentation').length
    },
    churnHeatmap: diffEntries.map(d => ({
      file: d.file,
      churnScore: d.additions + d.deletions,
      collisionRisk: d.collisionRisk
    })),
    diffEntries,
    diffSummary: diffEntries
  };
}

/**
 * Algorithmic O(log N) causal bisection search isolating the exact culprit agent step
 */
async function bisectAnomalyAsync(snapshotHistory = [], failurePredicate = null, executionResults = null, options = {}) {
  const history = snapshotHistory;
  if (history.length === 0) {
    return { bisectionComplete: false, anomalyFound: false, totalSnapshotsSearched: 0, bisectionIterationsRequired: 0, bisectionAuditTrace: [], reason: 'No snapshots available for this workspace.' };
  }
  if (monotonicityViolation(history)) {
    return { bisectionComplete: false, anomalyFound: false, totalSnapshotsSearched: history.length, bisectionIterationsRequired: 0, bisectionAuditTrace: [], reason: 'Snapshot health history is non-monotonic; causal bisection requires a healthy-to-failing sequence.' };
  }

  const predicateRetries = Math.max(1, Math.min(3, Number(options.predicateRetries) || 2));
  const evaluateSnapshot = async (snapshot) => {
    const evaluations = [];
    for (let attempt = 0; attempt < predicateRetries; attempt += 1) {
      evaluations.push(failurePredicate ? await failurePredicate(snapshot) : knownHealth(snapshot));
    }
    if (evaluations.some((evaluation) => typeof evaluation !== 'boolean')) return { stable: false, value: null, reason: 'Snapshot predicate did not produce a boolean health result.' };
    if (!evaluations.every((evaluation) => evaluation === evaluations[0])) return { stable: false, value: null, reason: 'Snapshot predicate was unstable across repeated evaluations.' };
    return { stable: true, value: evaluations[0] };
  };
  const baseline = await evaluateSnapshot(history[0]);
  if (!baseline.stable) {
    return { bisectionComplete: false, anomalyFound: false, totalSnapshotsSearched: history.length, bisectionIterationsRequired: 0, bisectionAuditTrace: [], reason: baseline.reason };
  }
  if (!baseline.value) {
    return { bisectionComplete: false, anomalyFound: false, totalSnapshotsSearched: history.length, bisectionIterationsRequired: 0, bisectionAuditTrace: [], reason: 'Causal bisection requires a healthy baseline snapshot before the first failing snapshot.' };
  }

  let low = 1;
  let high = history.length - 1;
  let culpritIdx = -1;
  const bisectionSteps = [];

  // O(log N) Binary Search for First Bad Commit
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const snap = history[mid];
    const evaluation = await evaluateSnapshot(snap);
    if (!evaluation.stable) {
      return { bisectionComplete: false, anomalyFound: false, totalSnapshotsSearched: history.length, bisectionIterationsRequired: bisectionSteps.length, bisectionAuditTrace: bisectionSteps, reason: evaluation.reason };
    }
    const isHealthy = evaluation.value;

    bisectionSteps.push({
      iteration: bisectionSteps.length + 1,
      testedIndex: mid,
      stepNumber: snap.step ?? snap.step_number,
      snapshotHash: snap.hash ?? snap.snapshot_hash,
      evaluatedStatus: isHealthy ? 'PASS (HEALTHY)' : 'FAIL (ANOMALY_PRESENT)'
    });

    if (!isHealthy) {
      culpritIdx = mid;
      // Search left half for earlier culprit
      high = mid - 1;
    } else {
      // Search right half
      low = mid + 1;
    }
  }

  if (culpritIdx < 0) {
    return {
      bisectionComplete: true,
      anomalyFound: false,
      evidenceLevel: 'regression_indicator',
      causalGuarantee: false,
      totalSnapshotsSearched: history.length,
      bisectionIterationsRequired: bisectionSteps.length,
      bisectionSteps: bisectionSteps.length,
      theoreticalComplexity: `O(log ${history.length}) = ${Math.ceil(Math.log2(history.length || 1))} steps`,
      bisectionAuditTrace: bisectionSteps,
      reason: 'All available snapshots satisfy the invariant.'
    };
  }

  const culpritSnap = history[culpritIdx];

  return {
    bisectionComplete: true,
    anomalyFound: true,
    evidenceLevel: 'regression_indicator',
    causalGuarantee: false,
    totalSnapshotsSearched: history.length,
    bisectionIterationsRequired: bisectionSteps.length,
    bisectionSteps: bisectionSteps.length,
    theoreticalComplexity: `O(log ${history.length}) = ${Math.ceil(Math.log2(history.length || 1))} steps`,
    bisectionAuditTrace: bisectionSteps,
    culpritReport: {
      stepNumber: culpritSnap.step ?? culpritSnap.step_number,
      snapshotHash: culpritSnap.hash ?? culpritSnap.snapshot_hash,
      culpritAgentId: culpritSnap.agent || culpritSnap.author || 'worker_fast_coder',
      actionDescription: executionResults?.get(culpritSnap)
        ? `Invariant command exited with ${executionResults.get(culpritSnap).exitCode}.\n${executionResults.get(culpritSnap).stderr || executionResults.get(culpritSnap).stdout || ''}`.trim()
        : culpritSnap.reason || culpritSnap.label,
      toolCall: 'isolated_test_runner',
      targetFile: null,
      rootCauseSummary: executionResults?.get(culpritSnap)?.stderr || culpritSnap.reason || culpritSnap.label || `First snapshot failing the supplied invariant: ${culpritSnap.label}`
    }
  };
}

// Synchronous compatibility surface for in-process benchmark callers. HTTP
// bisection uses bisectAnomalyAsync because its predicate runs a real command.
function bisectAnomaly(snapshotHistory = [], failurePredicate = null) {
  if (snapshotHistory.length === 0) return { bisectionComplete: false, anomalyFound: false, totalSnapshotsSearched: 0, bisectionIterationsRequired: 0, bisectionSteps: 0, bisectionAuditTrace: [], reason: 'No snapshots available for this workspace.' };
  if (monotonicityViolation(snapshotHistory)) return { bisectionComplete: false, anomalyFound: false, totalSnapshotsSearched: snapshotHistory.length, bisectionIterationsRequired: 0, bisectionSteps: 0, bisectionAuditTrace: [], reason: 'Snapshot health history is non-monotonic; causal bisection requires a healthy-to-failing sequence.' };
  if (failurePredicate && failurePredicate.constructor?.name === 'AsyncFunction') throw new Error('Use bisectAnomalyAsync for asynchronous predicates.');
  let low = 0; let high = snapshotHistory.length - 1; let culpritIdx = -1; const steps = [];
  while (low <= high) {
    const mid = Math.floor((low + high) / 2); const snapshot = snapshotHistory[mid];
    const healthy = failurePredicate ? failurePredicate(snapshot) : knownHealth(snapshot);
    if (healthy && healthy.then) throw new Error('Use bisectAnomalyAsync for asynchronous predicates.');
    if (typeof healthy !== 'boolean') return { bisectionComplete: false, anomalyFound: false, totalSnapshotsSearched: snapshotHistory.length, bisectionIterationsRequired: steps.length, bisectionSteps: steps.length, bisectionAuditTrace: steps, reason: 'Snapshot predicate did not produce a boolean health result.' };
    steps.push({ iteration: steps.length + 1, testedIndex: mid, stepNumber: snapshot.step, snapshotHash: snapshot.hash, evaluatedStatus: healthy ? 'PASS (HEALTHY)' : 'FAIL (ANOMALY_PRESENT)' });
    if (healthy) low = mid + 1; else { culpritIdx = mid; high = mid - 1; }
  }
  const base = { bisectionComplete: true, anomalyFound: culpritIdx >= 0, totalSnapshotsSearched: snapshotHistory.length, bisectionIterationsRequired: steps.length, bisectionSteps: steps.length, theoreticalComplexity: `O(log ${snapshotHistory.length}) = ${Math.ceil(Math.log2(snapshotHistory.length || 1))} steps`, bisectionAuditTrace: steps };
  const annotated = { ...base, evidenceLevel: 'regression_indicator', causalGuarantee: false };
  return culpritIdx < 0 ? { ...annotated, reason: 'All available snapshots satisfy the invariant.' } : { ...annotated, culpritReport: { stepNumber: snapshotHistory[culpritIdx].step, snapshotHash: snapshotHistory[culpritIdx].hash, culpritAgentId: snapshotHistory[culpritIdx].agent || 'worker_fast_coder', actionDescription: snapshotHistory[culpritIdx].desc, toolCall: 'isolated_test_runner', targetFile: null, rootCauseSummary: snapshotHistory[culpritIdx].reason || snapshotHistory[culpritIdx].label } };
}

/**
 * Generates an invariant-preserving surgical auto-remediation patch and atomic rollback
 */
async function remediateRollback(db, workspaceId, culpritReport = {}) {
  if (!db || typeof db.get !== 'function') throw new Error('A database handle is required for causal rollback.');
  const workspace = await db.get('SELECT * FROM workspaces WHERE id = ?', workspaceId);
  if (!workspace) throw new Error(`Workspace '${workspaceId}' not found for causal rollback.`);
  const reference = culpritReport.snapshotHash || culpritReport.snapshotId || culpritReport.stepNumber;
  if (reference == null) throw new Error('Culprit snapshot reference is required for causal rollback.');
  const snapshotStore = require('./workspaceSnapshotStore');
  const preview = await snapshotStore.preview({ db, workspace, reference });
  const restored = await snapshotStore.restore({ db, workspace, reference, author: 'causal-bisection' });
  const culpritFile = culpritReport.targetFile || preview.affectedFiles[0] || null;
  return {
    success: true,
    remediated: true,
    workspaceId,
    rolledBackCulpritStep: culpritReport.stepNumber,
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
    message: 'Durable snapshot restore completed with checksum verification.'
  };
}

/**
 * Automatically bisects a regression or invariant failure in a workspace.
 * Queries snapshots from SQLite or uses provided snapshot history, applies
 * O(log N) binary search, and triggers surgical remediation and rollback.
 *
 * @param {object} db SQLite database instance (optional if snapshotHistory provided)
 * @param {object} options Configuration object (workspaceId, workspaceRoot, testCommand, snapshotHistory, predicate, timeoutMs, autoRollback)
 */
async function autoBisectWorkspaceAnomaly(db, options = {}) {
  const {
    workspaceId,
    workspaceRoot,
    testCommand = 'npm test',
    snapshotHistory = null,
    predicate = null,
    timeoutMs = 30000,
    autoRollback = true
  } = options;

  let history = Array.isArray(snapshotHistory) ? [...snapshotHistory] : null;
  let workspace = null;

  if (!history && db && workspaceId) {
    try {
      history = await db.all(
        'SELECT * FROM workspace_snapshots WHERE workspace_id = ? ORDER BY step_number ASC LIMIT ?',
        workspaceId,
        MAX_BISECTION_SNAPSHOTS + 1
      );
      workspace = await db.get('SELECT * FROM workspaces WHERE id = ?', workspaceId);
    } catch (_) {
      history = [];
    }
  }

  if (history && history.length > MAX_BISECTION_SNAPSHOTS) {
    return {
      bisectionComplete: false,
      anomalyFound: false,
      totalSnapshotsSearched: history.length,
      reason: `Snapshot history exceeds the ${MAX_BISECTION_SNAPSHOTS}-snapshot bisection limit.`
    };
  }

  if (!history || history.length < 2) {
    return {
      bisectionComplete: false,
      anomalyFound: false,
      totalSnapshotsSearched: history ? history.length : 0,
      reason: 'Insufficient snapshots for bisection (at least 2 required).'
    };
  }

  let failurePredicate = predicate;
  const executionResults = new WeakMap();
  if (!failurePredicate) {
    const isDurable = history.some(s => {
      try {
        const meta = typeof s.metadata === 'string' ? JSON.parse(s.metadata || '{}') : (s.metadata || {});
        return meta.storage === 'durable-filesystem';
      } catch (_) { return false; }
    });

    if (isDurable) {
      try {
        const snapshotStore = require('./workspaceSnapshotStore');
        const wsPath = workspaceRoot || workspace?.path || process.cwd();
        failurePredicate = async (snap) => {
          const execution = await snapshotStore.runInSnapshot({
            snapshot: snap,
            command: testCommand,
            timeoutMs,
            workspacePath: wsPath
          });
           executionResults.set(snap, execution);
          return execution.exitCode === 0;
        };
      } catch (_) {
        failurePredicate = null;
      }
    }
  }

  if (!failurePredicate) {
    failurePredicate = (snap) => {
      if (snap._execution) return snap._execution.exitCode === 0;
      const health = knownHealth(snap);
      if (health !== null) return health;
      if (snap.status === 'failed' || snap.status === 'error') return false;
      return null;
    };
  }

  const bisectionResult = await bisectAnomalyAsync(history, failurePredicate, executionResults, { predicateRetries: options.predicateRetries });

  let remediation = null;
  if (bisectionResult.anomalyFound && autoRollback && db && workspaceId) {
    try {
      remediation = await remediateRollback(db, workspaceId || 'workspace_recovery', bisectionResult.culpritReport);
    } catch (error) {
      remediation = { success: false, remediated: false, reason: error.message };
    }
  } else if (bisectionResult.anomalyFound && autoRollback) {
    remediation = {
      success: false,
      remediated: false,
      reason: 'Durable rollback requires a database-backed workspace.'
    };
  }

  return {
    ...bisectionResult,
    remediation
  };
}

module.exports = {
  MAX_BISECTION_SNAPSHOTS,
  diffWorkspaces,
  bisectAnomaly,
  bisectAnomalyAsync,
  remediateRollback,
  autoBisectWorkspaceAnomaly
};

