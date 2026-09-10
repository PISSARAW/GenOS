/**
 * Bisection history helpers: health signals and snapshot references.
 */

function knownHealth(snapshot) {
  if (typeof snapshot.healthy === 'boolean') return snapshot.healthy;
  if (snapshot.metadata) {
    try {
      const metadata = typeof snapshot.metadata === 'string' ? JSON.parse(snapshot.metadata || '{}') : (snapshot.metadata || {});
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

function firstPresent(primary, fallback) {
  if (primary != null) return primary;
  if (fallback != null) return fallback;
  return null;
}

function toSnapshotRef(snap) {
  if (!snap) return null;
  const ref = {
    stepNumber: firstPresent(snap.step, snap.step_number),
    snapshotHash: firstPresent(snap.hash, snap.snapshot_hash),
    snapshotId: snap.id != null ? snap.id : null
  };
  if (ref.stepNumber == null && ref.snapshotHash == null && ref.snapshotId == null) return null;
  return ref;
}

// Reference of the latest pre-culprit snapshot evaluated PASS (HEALTHY).
// Never returns the culprit itself: restoring the first failing snapshot
// would reinstall the bug.
function findLastHealthyRef(history, steps, search) {
  let healthyIdx = -1;
  for (const step of steps) {
    if (step.testedIndex < search.culpritIdx && step.evaluatedStatus === 'PASS (HEALTHY)' && step.testedIndex > healthyIdx) {
      healthyIdx = step.testedIndex;
    }
  }
  if (healthyIdx < 0 && search.baselineHealthy && search.culpritIdx > 0) healthyIdx = 0;
  if (healthyIdx < 0) return null;
  return toSnapshotRef(history[healthyIdx]);
}

module.exports = {
  knownHealth,
  monotonicityViolation,
  toSnapshotRef,
  findLastHealthyRef
};
