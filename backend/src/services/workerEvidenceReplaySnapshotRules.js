'use strict';

function createReplaySnapshot(context) {
  return context.existing.snapshot_id !== context.snapshot.snapshot_id || context.last?.action !== 'worker_evidence_report'
        || context.last.payload?.executionRunId !== context.input.runId
        || context.last.payload?.evidenceReportHash !== context.reportHash;
}

function makeSnapshot(context) {
  return {
    snapshot_id: context.snapshotId,
    agent_id: context.source.agent_id || context.workerId,
    branch_id: context.source.branch_id || `branch-${context.digest(context.workerId).slice(0, 8)}`,
    world_id: context.source.world_id || context.input.worldId || 'world-main',
    created_at: new context.Date().toISOString(),
    genome: context.source.genome || {},
    state: { ...(context.source.state || {}), execution_status: 'completed',
      working_memory: [] }
  };
}

module.exports = { createReplaySnapshot, makeSnapshot };
