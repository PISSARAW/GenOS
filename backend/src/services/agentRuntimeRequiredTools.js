'use strict';

function requiredRuntimeTools(mission = {}, data = {}) {
  if (data.isWorker) return new Set(require('../../bin/worker-mcp-inventory-preflight.cjs').requiredWorkerTools(mission));
  if (mission.autonomousOrchestration === false) return new Set();
  return new Set(data.autonomyPlan?.mandatoryTools || data.autonomyPlan?.requiredTools || []);
}

module.exports = { requiredRuntimeTools };
