'use strict';

function assertRowValue1(__genosValueScope1) {
  return __genosValueScope1.row.runId !== __genosValueScope1.expected.runId || __genosValueScope1.row.scenarioId !== __genosValueScope1.expected.scenarioId
    || __genosValueScope1.row.seed !== __genosValueScope1.expected.seed || __genosValueScope1.row.armId !== __genosValueScope1.expected.armId
    || __genosValueScope1.row.model !== __genosValueScope1.expected.model || __genosValueScope1.row.provider !== __genosValueScope1.expected.provider
    || typeof __genosValueScope1.row.taskId !== 'string' || !__genosValueScope1.expected.taskIds.includes(__genosValueScope1.row.taskId);
}

function assertReceiptsValue2(__genosValueScope2) {
  return __genosValueScope2.receipt.runId !== __genosValueScope2.row.runId || __genosValueScope2.receipt.armId !== __genosValueScope2.row.armId
      || __genosValueScope2.receipt.taskId !== __genosValueScope2.row.taskId || __genosValueScope2.receipt.provider !== __genosValueScope2.expected.provider
      || __genosValueScope2.receipt.model !== __genosValueScope2.expected.model;
}

module.exports = { assertRowValue1, assertReceiptsValue2 };
