'use strict';

async function recoverDispatchStage1(__genosStageScope1) {
if (!['prepared', 'running'].includes(__genosStageScope1.execution.phase)) {
    let row = await __genosStageScope1.journal.getOperation(__genosStageScope1.db, __genosStageScope1.input.operationId);
    if (row.state === 'started') row = await (0, __genosStageScope1.advance)(__genosStageScope1.db, { operationId: row.id, state: 'effect_applied',
      result: { executionPersisted: true } });
    if (row.state === 'effect_applied') await (0, __genosStageScope1.advance)(__genosStageScope1.db, { operationId: row.id, state: 'completed',
      result: { executionPhase: __genosStageScope1.execution.phase } });
    await (0, __genosStageScope1.recordReceipt)(__genosStageScope1.db, { ...__genosStageScope1.input, disposition: 'completed', observedState: __genosStageScope1.execution.phase,
      evidence: { executionId: __genosStageScope1.execution.id } });
    return { value: ( 'completed') };
  }
}

module.exports = { recoverDispatchStage1 };
