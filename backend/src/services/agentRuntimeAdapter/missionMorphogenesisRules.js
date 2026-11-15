'use strict';

function proposedTopology(context) {
  return context.plan.trinity?.activated ? 'trinity'
      : context.plan.aTeam?.activated ? 'a_team'
        : context.mission.proposedTopology || context.mission.proposed_topology || context.mission.morphologyTopology
          || context.mission.morphology_topology || context.mission.morphology?.topology || null;
}

module.exports = { proposedTopology };
