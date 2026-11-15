'use strict';

function executeRule1(context) {
  return context.journalDb && ['CALL', 'EMIT'].includes(context.operation.kind)
          && !context.runtimeState.idempotentEffects.has(`${context.operation.kind}:${context.operation.reference}`);
}

function executeRule2(context) {
  return context.journalDb && ['CALL', 'EMIT'].includes(context.operation.kind)
          ? { ...context.operation, idempotencyKey: `gcir:${context.input.runId}:${context.operation.id}` } : context.operation;
}

module.exports = { executeRule1, executeRule2 };
