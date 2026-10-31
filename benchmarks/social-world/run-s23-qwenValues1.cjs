'use strict';

function mainValue1(__genosValueScope1) {
  return __genosValueScope1.previousMission.relationType === 'friend'
      && __genosValueScope1.resumedMission.relationType === 'friend'
      && __genosValueScope1.resumedMission.relations[0].properties.lastInteraction === 'mission-1:shared-evidence-42';
}

module.exports = { mainValue1 };
