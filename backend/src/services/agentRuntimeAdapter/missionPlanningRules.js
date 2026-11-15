'use strict';

function applyExecutionPolicy(context) {
  return {
    ...require('../workerInferenceLimits').policyFields(context.normalizedMission),
    allowedCommands: context.Array.isArray(context.normalizedMission.executionPolicy?.allowedCommands)
      ? [...new context.Set(context.normalizedMission.executionPolicy.allowedCommands.map((value) => context.String(value).trim()).filter(context.Boolean))]
      : [],
    allowFileEdits: context.normalizedMission.executionPolicy?.allowFileEdits === true,
    ...(context.Array.isArray(context.normalizedMission.executionPolicy?.allowedWritePaths)
      ? { allowedWritePaths: [...new context.Set(context.normalizedMission.executionPolicy.allowedWritePaths
        .map((value) => context.String(value).trim()).filter(context.Boolean))] } : {}),
    gqwfV2: context.normalizedMission.executionPolicy?.gqwfV2 === true,
    gqwfMaterializer: context.normalizedMission.executionPolicy?.gqwfMaterializer,
    explicitWriteLease: context.normalizedMission.executionPolicy?.explicitWriteLease === true,
    requestedWorkers: context.Number.isFinite(context.requestedWorkers) && context.requestedWorkers > 0 ? context.requestedWorkers : 0,
    silentUpdates: context.silentUpdates
  };
}

module.exports = { applyExecutionPolicy };
