'use strict';

const topologyCapabilityService = require('./topologyCapabilityService');

function topologyMode(autonomyPlan) {
  if (autonomyPlan.trinity?.activated) return 'trinity';
  if (autonomyPlan.aTeam?.activated) return 'a_team';
  return null;
}

function explicitContract(mission) {
  const candidate = mission.topologyContract || mission.missionCapabilityPlan?.topologyContract;
  return candidate && Array.isArray(candidate.required) ? candidate : null;
}

function conceptTools(mission) {
  const candidates = Array.isArray(mission.conceptLeaseCandidates)
    ? mission.conceptLeaseCandidates : [];
  return [...new Set(candidates.flatMap((candidate) => Array.isArray(candidate?.tools)
    ? candidate.tools : []).map((tool) => String(tool || '').trim().toLowerCase())
    .filter((tool) => tool && tool !== 'genos_orchestrate'))];
}

function applyMissionCapabilityContract(autonomyPlan, mission = {}) {
  autonomyPlan.capabilityContract = explicitContract(mission) || topologyCapabilityService.contractFor({
    mode: topologyMode(autonomyPlan), organization: autonomyPlan.organization
  });
  autonomyPlan.requiredTools = [...new Set([...(autonomyPlan.requiredTools || []), ...conceptTools(mission)])];
  return autonomyPlan;
}

module.exports = { applyMissionCapabilityContract, conceptTools };
