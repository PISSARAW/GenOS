'use strict';

function contextRequestFieldsValue1(__genosValueScope1) {
  return {
    organization: __genosValueScope1.plan ? __genosValueScope1.plan.organization || __genosValueScope1.undefined : __genosValueScope1.morphology.selectedOrganization || __genosValueScope1.undefined,
    developmentalContext: __genosValueScope1.mission.developmentalContext || null, morphologyPlan: __genosValueScope1.morphology,
    missionCapabilityPlan: __genosValueScope1.plan || null,
    problemProfile: { ...(__genosValueScope1.mission.profile || {}), ...(__genosValueScope1.mission.kind === 'implement' ? { type: 'implementation' } : {}) },
    sensoryContext: __genosValueScope1.mission.sensoryContext || null
  };
}

module.exports = { contextRequestFieldsValue1 };
