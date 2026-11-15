'use strict';

function recordExecutedBatchRule1(context) {
  return !context.db || !context.missionId || !context.agentId || !context.executionRunId || !context.Array.isArray(context.input.tests)
      || context.input.tests.length === 0 || !context.Array.isArray(context.input.workspaceFiles);
}

function validRow(context) {
  return context.payload.schema === context.SCHEMA && context.payload.receiptId === context.row.receipt_id
    && context.payload.missionId === context.missionId && context.payload.agentId === context.row.agent_id
    && context.payload.executionRunId === context.row.execution_run_id && context.payload.outcome === context.row.outcome
    && context.Array.isArray(context.payload.tests) && context.payload.tests.length > 0;
}

function collectVerifiedForMissionRule3(context) {
  return !context.payload || !context.completedMembers.has(context.row.agent_id) || !context.validRow(context.row, context.payload, context.missionId);
}

function recordExecutedBatchRule4(context) {
  return { schema: context.SCHEMA, receiptId: `test_${context.crypto.randomUUID()}`,
    batchId: context.crypto.randomUUID(), missionId: context.missionId, agentId: context.agentId, executionRunId: context.executionRunId, workspaceRoot: context.workspaceRoot,
    startedAt: context.input.startedAt || null, completedAt: context.input.completedAt || new context.Date().toISOString(),
    outcome: context.outcome, tests: context.tests, workspaceDigest: context.workspaceDigest(context.input.workspaceFiles), ...(context.input.reviewSnapshot ? { reviewSnapshot: context.input.reviewSnapshot } : {}),
    changedFileHashes: (context.input.changedFileHashes || []).map(({ path: file, hash }) => ({ path: file, hash }))
      .sort((left, right) => left.path.localeCompare(right.path)) };
}

function collectVerifiedForMissionRule5(context) {
  return context.payload.outcome !== 'passed' || !context.payload.tests.every(test => test.exitCode === 0 && test.signal === null);
}

module.exports = { recordExecutedBatchRule1, validRow, collectVerifiedForMissionRule3, recordExecutedBatchRule4, collectVerifiedForMissionRule5 };
