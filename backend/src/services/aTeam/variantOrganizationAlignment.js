'use strict';

const coordination = require('../aTeamCoordinationService');
const { prepareTeamLifecycle } = require('./lifecycle/teamLifecycleService');

function alignTeamOrganization(team, policy, input = {}) {
  if (!policy || !policy.organization) return team;
  if (team.organization === policy.organization) return team;
  const coordinated = coordination.coordinateMembers(team.members, {
    organization: policy.organization,
    availableCapabilities: input.availableCapabilities
  });
  const lifecycle = prepareTeamLifecycle({
    goal: input.goal,
    successCriteria: input.successCriteria,
    organization: coordinated.organization,
    members: team.members,
    requiredCapabilities: team.members.flatMap((member) =>
      (member.capabilities || []).map((capability) => ({ capability }))),
    availableSlots: input.availableSlots
  });
  Object.assign(team, coordinated, lifecycle);
  return team;
}

module.exports = { alignTeamOrganization };
