'use strict';

const RESOURCE_ALLOCATION = /\b(?:allocat\w*|distribut\w*|partition\w*|capacity|capacities|bin|bins|group|groups|budget|resource|reparti\w*|groupe\w*|plafond|capacit\w*|ressource\w*)\b/i;

function inferMissionTopologySignals(mission) {
  const text = String(mission || '');
  const teamAnalysis = require('../aTeamService').analyzeMission(text);
  return {
    a_team_eligible: teamAnalysis.recommended === true && teamAnalysis.detectedDomains.length >= 2,
    resource_allocation_focus: RESOURCE_ALLOCATION.test(text) ? 1 : 0
  };
}

module.exports = { inferMissionTopologySignals };
