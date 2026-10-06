'use strict';

const biologicalExecutionReceiptService = require('../biologicalExecutionReceiptService.js');

async function persistBiologicalMissionTick({ db, context, parent, mission }) {
  if (!context.missionId) return;
  await biologicalExecutionReceiptService.runMissionTick(db, {
    missionId: context.missionId,
    mission,
    organizationId: parent.organization_id,
    projectId: parent.project_id,
    timeoutMs: context.request.timeoutMs
  });
}

module.exports = { persistBiologicalMissionTick };