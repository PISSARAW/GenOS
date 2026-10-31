'use strict';

function publishValue1(__genosValueScope1) {
  return __genosValueScope1.mission.orchestratorAgentId || __genosValueScope1.mission.orchestratorId || __genosValueScope1.mission.agentId;
}

module.exports = { publishValue1 };
