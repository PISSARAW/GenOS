'use strict';

function createReplaySnapshotValue1(__genosValueScope1) {
  return __genosValueScope1.existing.snapshot_id !== __genosValueScope1.snapshot.snapshot_id || __genosValueScope1.last?.action !== 'worker_evidence_report'
        || __genosValueScope1.last.payload?.executionRunId !== __genosValueScope1.input.runId
        || __genosValueScope1.last.payload?.evidenceReportHash !== __genosValueScope1.reportHash;
}

function makeSnapshotValue2(__genosValueScope2) {
  return {
    snapshot_id: __genosValueScope2.snapshotId,
    agent_id: __genosValueScope2.source.agent_id || __genosValueScope2.workerId,
    branch_id: __genosValueScope2.source.branch_id || `branch-${(0, __genosValueScope2.digest)(__genosValueScope2.workerId).slice(0, 8)}`,
    world_id: __genosValueScope2.source.world_id || __genosValueScope2.input.worldId || 'world-main',
    created_at: new __genosValueScope2.Date().toISOString(),
    genome: __genosValueScope2.source.genome || {},
    state: { ...(__genosValueScope2.source.state || {}), execution_status: 'completed',
      working_memory: [] }
  };
}

module.exports = { createReplaySnapshotValue1, makeSnapshotValue2 };
