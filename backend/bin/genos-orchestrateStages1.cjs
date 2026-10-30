'use strict';

async function finalizeOrchestratedMissionStage1(__genosStageScope1) {
if (__genosStageScope1.missionId && !__genosStageScope1.dormant) await __genosStageScope1.missionIdentity.setStatus(__genosStageScope1.db, __genosStageScope1.missionId, __genosStageScope1.finalStatus.success ? 'completed' : 'failed');
}

module.exports = { finalizeOrchestratedMissionStage1 };
