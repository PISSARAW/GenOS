'use strict';

const { objectValue, textValue, listValue, numberValue, objectOrEmpty, isoDateOrNull, enumValue } = require('./validation');

function normalizeConstraints(value) {
  const constraints = objectOrEmpty(value, 'constraints');
  return {
    cost: constraints.cost === undefined || constraints.cost === null ? null : numberValue(constraints.cost, 'constraints.cost'),
    latency: constraints.latency === undefined || constraints.latency === null ? null : numberValue(constraints.latency, 'constraints.latency'),
    privacy: enumValue(constraints.privacy, { allowed: ['ANY', 'PUBLIC', 'INTERNAL', 'RESTRICTED'], field: 'constraints.privacy', fallback: 'ANY' }),
    tools: listValue(constraints.tools, 'constraints.tools'),
    locality: enumValue(constraints.locality, { allowed: ['ANY', 'LOCAL', 'WORKSPACE', 'REMOTE'], field: 'constraints.locality', fallback: 'ANY' }),
    risk: numberValue(constraints.risk, 'constraints.risk', { maximum: 1, fallback: 1 })
  };
}

function normalizeCapabilityNeed(value) {
  const need = objectValue(value, 'CapabilityNeed');
  return {
    needId: textValue(need.needId, 'needId'),
    capability: textValue(need.capability, 'capability'),
    requiredInputs: listValue(need.requiredInputs, 'requiredInputs'),
    expectedOutputs: listValue(need.expectedOutputs, 'expectedOutputs'),
    evidenceRequirements: listValue(need.evidenceRequirements, 'evidenceRequirements'),
    constraints: normalizeConstraints(need.constraints),
    criticality: numberValue(need.criticality, 'criticality', { maximum: 1, fallback: 0.5 }),
    deadline: isoDateOrNull(need.deadline, 'deadline')
  };
}

module.exports = { normalizeCapabilityNeed };
