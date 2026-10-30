'use strict';

function recordExecutedBatchValue1(__genosValueScope1) {
  return !__genosValueScope1.db || !__genosValueScope1.missionId || !__genosValueScope1.agentId || !__genosValueScope1.executionRunId || !__genosValueScope1.Array.isArray(__genosValueScope1.input.tests)
      || __genosValueScope1.input.tests.length === 0 || !__genosValueScope1.Array.isArray(__genosValueScope1.input.workspaceFiles);
}

function validRowValue2(__genosValueScope2) {
  return __genosValueScope2.payload.schema === __genosValueScope2.SCHEMA && __genosValueScope2.payload.receiptId === __genosValueScope2.row.receipt_id
    && __genosValueScope2.payload.missionId === __genosValueScope2.missionId && __genosValueScope2.payload.agentId === __genosValueScope2.row.agent_id
    && __genosValueScope2.payload.executionRunId === __genosValueScope2.row.execution_run_id && __genosValueScope2.payload.outcome === __genosValueScope2.row.outcome
    && __genosValueScope2.Array.isArray(__genosValueScope2.payload.tests) && __genosValueScope2.payload.tests.length > 0;
}

function collectVerifiedForMissionValue3(__genosValueScope3) {
  return !__genosValueScope3.payload || !__genosValueScope3.completedMembers.has(__genosValueScope3.row.agent_id) || !(0, __genosValueScope3.validRow)(__genosValueScope3.row, __genosValueScope3.payload, __genosValueScope3.missionId);
}

function recordExecutedBatchValue4(__genosValueScope4) {
  return { schema: __genosValueScope4.SCHEMA, receiptId: `test_${__genosValueScope4.crypto.randomUUID()}`,
    batchId: __genosValueScope4.crypto.randomUUID(), missionId: __genosValueScope4.missionId, agentId: __genosValueScope4.agentId, executionRunId: __genosValueScope4.executionRunId, workspaceRoot: __genosValueScope4.workspaceRoot,
    startedAt: __genosValueScope4.input.startedAt || null, completedAt: __genosValueScope4.input.completedAt || new __genosValueScope4.Date().toISOString(),
    outcome: __genosValueScope4.outcome, tests: __genosValueScope4.tests, workspaceDigest: (0, __genosValueScope4.workspaceDigest)(__genosValueScope4.input.workspaceFiles),
    changedFileHashes: (__genosValueScope4.input.changedFileHashes || []).map(({ path: file, hash }) => ({ path: file, hash }))
      .sort((left, right) => left.path.localeCompare(right.path)) };
}

function collectVerifiedForMissionValue5(__genosValueScope5) {
  return __genosValueScope5.payload.outcome !== 'passed' || !__genosValueScope5.payload.tests.every(test => test.exitCode === 0 && test.signal === null);
}

module.exports = { recordExecutedBatchValue1, validRowValue2, collectVerifiedForMissionValue3, recordExecutedBatchValue4, collectVerifiedForMissionValue5 };
