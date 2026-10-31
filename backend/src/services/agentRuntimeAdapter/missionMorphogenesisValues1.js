'use strict';

function proposedTopologyValue1(__genosValueScope1) {
  return __genosValueScope1.plan.trinity?.activated ? 'trinity'
      : __genosValueScope1.plan.aTeam?.activated ? 'a_team'
        : __genosValueScope1.mission.proposedTopology || __genosValueScope1.mission.proposed_topology || __genosValueScope1.mission.morphologyTopology
          || __genosValueScope1.mission.morphology_topology || __genosValueScope1.mission.morphology?.topology || null;
}

module.exports = { proposedTopologyValue1 };
