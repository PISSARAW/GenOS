'use strict';

const MISSION_OWNER_ACTIONS = new Set([
  'orchestrate', 'dispatch_team', 'dispatch_trinity', 'dispatch_biological'
]);

function shouldAttachMissionOrchestrator(action, missionId, synthesizedWorkerMission = false) {
  if (!missionId) return false;
  if (action === 'dispatch_worker') return synthesizedWorkerMission;
  return MISSION_OWNER_ACTIONS.has(action);
}

module.exports = { shouldAttachMissionOrchestrator };
