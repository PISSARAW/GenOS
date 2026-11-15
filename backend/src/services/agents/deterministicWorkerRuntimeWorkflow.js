'use strict';

async function publishDeterministicResult(context) {
if (context.event.eventType === 'AGENT_COMPLETED' && context.event.payload?.snapshot) {
    const decision = context.require('../orchestrationDecisionService').decideFromEvent(context.event);
    const orchestratorId = context.require('./deterministicWorkerRuntimeRules.js').publish({ mission: context.mission });
    if (decision?.tool === 'genos_replay') {
      const action = await context.require('../orchestrationActionExecutor').execute({
        orchestratorId, sourceAgentId: context.mission.agentId, decision, event: context.event,
        workspaceRoot: context.mission.workspaceRoot
      }).catch(() => context.undefined);
      if (action?.executed && action.result?.proof) {
        context.event.payload.replayReceipt = action.result.proof;
        context.recordWorkerEvidence(context.mission, context.event);
      }
    }
  }
}

module.exports = { publishDeterministicResult };
