'use strict';

function workerKindsForCandidateStage1(__genosStageScope1) {
if (__genosStageScope1.topologyId === 'trinity') {
      const options = __genosStageScope1.variantEntry.variantId === 'default' ? {} : { variantId: __genosStageScope1.variantEntry.variantId };
      __genosStageScope1.members = (0, __genosStageScope1.require)('../trinityService').compose(__genosStageScope1.mission, options);
    } else if (__genosStageScope1.topologyId === 'a_team') {
      const analysis = (0, __genosStageScope1.require)('../aTeamService').analyzeMission(__genosStageScope1.mission);
      if (!analysis.recommended || !analysis.members.length) {
        throw __genosStageScope1.Object.assign(new __genosStageScope1.Error('A-Team composition is not executable for this mission.'), {
          code: 'A_TEAM_MULTIDISCIPLINARY_REQUIRED'
        });
      }
      __genosStageScope1.members = analysis.members;
    } else {
      __genosStageScope1.members = (0, __genosStageScope1.require)('../biologicalModeService').compose(__genosStageScope1.topologyId, __genosStageScope1.mission);
    }
}

module.exports = { workerKindsForCandidateStage1 };
