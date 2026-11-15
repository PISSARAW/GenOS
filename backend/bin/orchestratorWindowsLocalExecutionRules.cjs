'use strict';

function runWindowsLocalExecution(context) {
  return {
      eventType: 'ORCHESTRATOR_POSTFLIGHT_FAILED', agentId: context.id, action: context.error.tool || context.error.code || 'POSTFLIGHT',
      detail: context.error.message, severity: 'warning',
      payload: { missionId: context.missionId, executionRunId: context.executionRunId, code: context.error.code || null, tool: context.error.tool || null,
        observedTools: context.postflight.observedTools }
    };
}

module.exports = { runWindowsLocalExecution };
