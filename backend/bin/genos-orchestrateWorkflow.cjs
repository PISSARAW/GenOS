'use strict';

async function finalizeOrchestratedMission(context) {
if (context.missionId && !context.dormant) await context.missionIdentity.setStatus(context.db, context.missionId, context.finalStatus.success ? 'completed' : 'failed');
}

module.exports = { finalizeOrchestratedMission };
