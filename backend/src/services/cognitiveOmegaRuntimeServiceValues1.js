'use strict';

function executeValue1(__genosValueScope1) {
  return __genosValueScope1.journalDb && ['CALL', 'EMIT'].includes(__genosValueScope1.operation.kind)
          && !__genosValueScope1.runtimeState.idempotentEffects.has(`${__genosValueScope1.operation.kind}:${__genosValueScope1.operation.reference}`);
}

function executeValue2(__genosValueScope2) {
  return __genosValueScope2.journalDb && ['CALL', 'EMIT'].includes(__genosValueScope2.operation.kind)
          ? { ...__genosValueScope2.operation, idempotencyKey: `gcir:${__genosValueScope2.input.runId}:${__genosValueScope2.operation.id}` } : __genosValueScope2.operation;
}

module.exports = { executeValue1, executeValue2 };
