'use strict';

function contextRequestFields(context) {
  return {
    organization: context.plan ? context.plan.organization || context.undefined : context.morphology.selectedOrganization || context.undefined,
    developmentalContext: context.mission.developmentalContext || null, morphologyPlan: context.morphology,
    missionCapabilityPlan: context.plan || null,
    problemProfile: { ...(context.mission.profile || {}), ...(context.mission.kind === 'implement' ? { type: 'implementation' } : {}) },
    sensoryContext: context.mission.sensoryContext || null
  };
}

module.exports = { contextRequestFields };
