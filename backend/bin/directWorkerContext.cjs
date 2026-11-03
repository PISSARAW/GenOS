'use strict';

async function attachDirectWorkerTerritory(db, input) {
  const request = { ...input.request, workspacePath: input.request.workspacePath
    || input.request.workspaceRoot || input.request.workspace_root };
  if (!request.workspacePath) return input.prompt;
  const entry = await require('../src/services/daemon/daemonProductionBridge')
    .announceMissionStart({ db, request });
  return require('./orchestratorMissionHelpers.cjs')
    .attachTerritoryBrief(db, input.prompt, entry?.handoffSignal);
}

function attachEnvelope(mission, request) {
  Object.assign(mission, require('../src/services/qualityElevation/qualityMissionContract').qualityMissionFields(request));
  Object.assign(mission, require('../src/services/workerTeamContract').missionFields(request));
  mission.readOnlyWorkspaceEvidence = request.readOnlyWorkspaceEvidence === true;
  if (Number.isFinite(request.timeoutMs) && request.timeoutMs > 0) {
    mission.executionDeadlineAt = new Date(Date.now() + request.timeoutMs).toISOString();
  }
  return mission;
}

module.exports = { attachDirectWorkerTerritory, attachEnvelope };
