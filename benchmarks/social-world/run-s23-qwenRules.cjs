'use strict';

function main(context) {
  return context.previousMission.relationType === 'friend'
      && context.resumedMission.relationType === 'friend'
      && context.resumedMission.relations[0].properties.lastInteraction === 'mission-1:shared-evidence-42';
}

module.exports = { main };
