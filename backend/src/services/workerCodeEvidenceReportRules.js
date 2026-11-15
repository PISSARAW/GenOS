'use strict';

function kindSpecificEvidence(context) {
  return context.mission.workerContract?.mission?.specialtyNiche
      || context.mission.workerContract?.niche?.domain || context.mission.specialtyNiche || context.mission.nicheDomain;
}

module.exports = { kindSpecificEvidence };
