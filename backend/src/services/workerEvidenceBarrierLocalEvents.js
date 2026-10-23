'use strict';

const userProgress = require('./userProgressService');

function reportMilestone(mission, event) {
  const milestone = userProgress.milestoneFromEvent(event, { agentId: mission.agentId,
    agentName: mission.name, task: mission.prompt });
  if (!milestone) return;
  const silent = mission.executionPolicy?.silentUpdates === true;
  const orchestratorId = mission.orchestratorAgentId || mission.agentId;
  userProgress.report({ ...milestone, orchestratorId, sourceAgentId: mission.agentId, silent });
}

module.exports = { reportMilestone };
