'use strict';

const { requiredText, uniqueText } = require('./securityPerceptionPrimitives');

function record(state, input) {
  const incidentId = requiredText(input?.incidentId, 'ASP_INCIDENT_ID_REQUIRED', 128);
  const incident = { incidentId, disposition: requiredText(input.disposition, 'ASP_INCIDENT_DISPOSITION_REQUIRED', 64),
    cause: input.cause ? String(input.cause).slice(0, 512) : null,
    falsePositive: input.falsePositive === true, evidenceRefs: uniqueText(input.evidenceRefs),
    timeline: Array.isArray(input.timeline) ? input.timeline.slice(-100) : [], updatedAt: new Date().toISOString() };
  state.incidents[incidentId] = incident;
  return incident;
}

module.exports = { record };
