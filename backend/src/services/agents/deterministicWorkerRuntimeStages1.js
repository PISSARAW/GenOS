'use strict';

async function publishStage1(__genosStageScope1) {
if (__genosStageScope1.event.eventType === 'AGENT_COMPLETED' && __genosStageScope1.event.payload?.snapshot) {
    const decision = (0, __genosStageScope1.require)('../orchestrationDecisionService').decideFromEvent(__genosStageScope1.event);
    const orchestratorId = (0, __genosStageScope1.require)('./deterministicWorkerRuntimeValues1.js').publishValue1({ mission: __genosStageScope1.mission });
    if (decision?.tool === 'genos_replay') {
      const action = await (0, __genosStageScope1.require)('../orchestrationActionExecutor').execute({
        orchestratorId, sourceAgentId: __genosStageScope1.mission.agentId, decision, event: __genosStageScope1.event,
        workspaceRoot: __genosStageScope1.mission.workspaceRoot
      }).catch(() => __genosStageScope1.undefined);
      if (action?.executed && action.result?.proof) {
        __genosStageScope1.event.payload.replayReceipt = action.result.proof;
        (0, __genosStageScope1.recordWorkerEvidence)(__genosStageScope1.mission, __genosStageScope1.event);
      }
    }
  }
}

module.exports = { publishStage1 };
