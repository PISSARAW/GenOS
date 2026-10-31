'use strict';

function runWindowsLocalExecutionValue1(__genosValueScope1) {
  return {
      eventType: 'ORCHESTRATOR_POSTFLIGHT_FAILED', agentId: __genosValueScope1.id, action: __genosValueScope1.error.tool || __genosValueScope1.error.code || 'POSTFLIGHT',
      detail: __genosValueScope1.error.message, severity: 'warning',
      payload: { missionId: __genosValueScope1.missionId, executionRunId: __genosValueScope1.executionRunId, code: __genosValueScope1.error.code || null, tool: __genosValueScope1.error.tool || null,
        observedTools: __genosValueScope1.postflight.observedTools }
    };
}

module.exports = { runWindowsLocalExecutionValue1 };
