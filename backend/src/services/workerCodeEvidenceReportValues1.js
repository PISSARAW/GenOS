'use strict';

function kindSpecificEvidenceValue1(__genosValueScope1) {
  return __genosValueScope1.mission.workerContract?.mission?.specialtyNiche
      || __genosValueScope1.mission.workerContract?.niche?.domain || __genosValueScope1.mission.specialtyNiche || __genosValueScope1.mission.nicheDomain;
}

module.exports = { kindSpecificEvidenceValue1 };
