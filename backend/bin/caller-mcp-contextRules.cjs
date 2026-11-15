'use strict';

function createContext(context) {
  return { ...context.state,
    selfIntro: `You are ${context.agentName}, GenOS ${context.mission.executionMode}.`, conscienceBlock: '', memoryBlock: context.memoryBlock,
    authorityInstruction: context.prompts.buildAuthorityInstruction(context.mission, context.isWorker, context.autonomyPlan),
    runtimeContract: context.prompts.compactStrategyContract(context.strategyContract, context.isWorker),
    runtimeAutonomyPlan: context.prompts.compactAutonomyPlan(context.autonomyPlan),
    executionPolicy: context.JSON.parse(context.mission.executionPolicyJson || '{}'),
    genosCapsule: context.JSON.parse(context.mission.genosCapsuleJson || '{}'), allowFileEdits: false, allowedCommands: [],
    coordinationOwner: context.isWorker && context.workerMcpPreflight.continuousCoordination(context.mission) ? 'model' : 'none'
  };
}

module.exports = { createContext };
