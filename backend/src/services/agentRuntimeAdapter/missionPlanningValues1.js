'use strict';

function applyExecutionPolicyValue1(__genosValueScope1) {
  return {
    allowedCommands: __genosValueScope1.Array.isArray(__genosValueScope1.normalizedMission.executionPolicy?.allowedCommands)
      ? [...new __genosValueScope1.Set(__genosValueScope1.normalizedMission.executionPolicy.allowedCommands.map((value) => (0, __genosValueScope1.String)(value).trim()).filter(__genosValueScope1.Boolean))]
      : [],
    allowFileEdits: __genosValueScope1.normalizedMission.executionPolicy?.allowFileEdits === true,
    ...(__genosValueScope1.Array.isArray(__genosValueScope1.normalizedMission.executionPolicy?.allowedWritePaths)
      ? { allowedWritePaths: [...new __genosValueScope1.Set(__genosValueScope1.normalizedMission.executionPolicy.allowedWritePaths
        .map((value) => (0, __genosValueScope1.String)(value).trim()).filter(__genosValueScope1.Boolean))] } : {}),
    gqwfV2: __genosValueScope1.normalizedMission.executionPolicy?.gqwfV2 === true,
    gqwfMaterializer: __genosValueScope1.normalizedMission.executionPolicy?.gqwfMaterializer,
    explicitWriteLease: __genosValueScope1.normalizedMission.executionPolicy?.explicitWriteLease === true,
    requestedWorkers: __genosValueScope1.Number.isFinite(__genosValueScope1.requestedWorkers) && __genosValueScope1.requestedWorkers > 0 ? __genosValueScope1.requestedWorkers : 0,
    silentUpdates: __genosValueScope1.silentUpdates
  };
}

module.exports = { applyExecutionPolicyValue1 };
