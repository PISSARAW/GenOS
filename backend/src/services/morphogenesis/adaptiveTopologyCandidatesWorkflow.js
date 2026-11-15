'use strict';

function workerKindsForCandidate(context) {
if (context.topologyId === 'trinity') {
      const options = context.variantEntry.variantId === 'default' ? {} : { variantId: context.variantEntry.variantId };
      context.members = context.require('../trinityService').compose(context.mission, options);
    } else if (context.topologyId === 'a_team') {
      const analysis = context.require('../aTeamService').analyzeMission(context.mission);
      if (!analysis.recommended || !analysis.members.length) {
        throw context.Object.assign(new context.Error('A-Team composition is not executable for this mission.'), {
          code: 'A_TEAM_MULTIDISCIPLINARY_REQUIRED'
        });
      }
      context.members = analysis.members;
    } else {
      context.members = context.require('../biologicalModeService').compose(context.topologyId, context.mission);
    }
}

module.exports = { workerKindsForCandidate };
