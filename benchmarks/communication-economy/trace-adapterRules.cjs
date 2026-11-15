'use strict';

function assertRow(context) {
  return context.row.runId !== context.expected.runId || context.row.scenarioId !== context.expected.scenarioId
    || context.row.seed !== context.expected.seed || context.row.armId !== context.expected.armId
    || context.row.model !== context.expected.model || context.row.provider !== context.expected.provider
    || typeof context.row.taskId !== 'string' || !context.expected.taskIds.includes(context.row.taskId);
}

function assertReceipts(context) {
  return context.receipt.runId !== context.row.runId || context.receipt.armId !== context.row.armId
      || context.receipt.taskId !== context.row.taskId || context.receipt.provider !== context.expected.provider
      || context.receipt.model !== context.expected.model;
}

module.exports = { assertRow, assertReceipts };
