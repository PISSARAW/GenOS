'use strict';

function organizationForMission(input) {
  return input.normalizedMission?.organization || input.autonomyPlan?.organization || null;
}

module.exports = { organizationForMission };
