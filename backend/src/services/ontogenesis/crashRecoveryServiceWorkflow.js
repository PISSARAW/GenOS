'use strict';

async function recoverDispatch(context) {
if (!['prepared', 'running'].includes(context.execution.phase)) {
    let row = await context.journal.getOperation(context.db, context.input.operationId);
    if (row.state === 'started') row = await context.advance(context.db, { operationId: row.id, state: 'effect_applied',
      result: { executionPersisted: true } });
    if (row.state === 'effect_applied') await context.advance(context.db, { operationId: row.id, state: 'completed',
      result: { executionPhase: context.execution.phase } });
    await context.recordReceipt(context.db, { ...context.input, disposition: 'completed', observedState: context.execution.phase,
      evidence: { executionId: context.execution.id } });
    return { value: ( 'completed') };
  }
}

module.exports = { recoverDispatch };
