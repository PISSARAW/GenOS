'use strict';

function publish(context) {
  return context.mission.orchestratorAgentId || context.mission.orchestratorId || context.mission.agentId;
}

module.exports = { publish };
