'use strict';

function createContextValue1(__genosValueScope1) {
  return { ...__genosValueScope1.state,
    selfIntro: `You are ${__genosValueScope1.agentName}, GenOS ${__genosValueScope1.mission.executionMode}.`, conscienceBlock: '', memoryBlock: __genosValueScope1.memoryBlock,
    authorityInstruction: __genosValueScope1.prompts.buildAuthorityInstruction(__genosValueScope1.mission, __genosValueScope1.isWorker, __genosValueScope1.autonomyPlan),
    runtimeContract: __genosValueScope1.prompts.compactStrategyContract(__genosValueScope1.strategyContract, __genosValueScope1.isWorker),
    runtimeAutonomyPlan: __genosValueScope1.prompts.compactAutonomyPlan(__genosValueScope1.autonomyPlan),
    executionPolicy: __genosValueScope1.JSON.parse(__genosValueScope1.mission.executionPolicyJson || '{}'),
    genosCapsule: __genosValueScope1.JSON.parse(__genosValueScope1.mission.genosCapsuleJson || '{}'), allowFileEdits: false, allowedCommands: [],
    coordinationOwner: __genosValueScope1.isWorker && __genosValueScope1.workerMcpPreflight.continuousCoordination(__genosValueScope1.mission) ? 'model' : 'none'
  };
}

module.exports = { createContextValue1 };
