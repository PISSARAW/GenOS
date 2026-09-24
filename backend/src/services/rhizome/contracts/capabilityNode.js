'use strict';

const { NODE_KINDS, NODE_STATES } = require('../constants');
const { objectValue, textValue, listValue, enumValue, numberValue, objectOrEmpty, isoDateOrNull } = require('./validation');

const PROVIDER_KINDS = Object.freeze(['agent', 'daemon', 'tool', 'service', 'human', 'runtime']);

function normalizeProvider(value, index) {
  const provider = objectValue(value, `providers[${index}]`);
  return {
    providerId: textValue(provider.providerId, `providers[${index}].providerId`),
    kind: enumValue(provider.kind, { allowed: PROVIDER_KINDS, field: `providers[${index}].kind` }),
    reference: provider.reference === undefined ? null : textValue(provider.reference, `providers[${index}].reference`)
  };
}

function normalizeProviders(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw Object.assign(new Error('Invalid Rhizome providers: expected an array'), { code: 'RHIZOME_CONTRACT_INVALID', field: 'providers' });
  return value.map(normalizeProvider);
}

function normalizeAvailability(value) {
  const availability = objectOrEmpty(value, 'availability');
  return {
    status: enumValue(availability.status, { allowed: ['UNKNOWN', 'AVAILABLE', 'UNAVAILABLE'], field: 'availability.status', fallback: 'UNKNOWN' }),
    checkedAt: isoDateOrNull(availability.checkedAt, 'availability.checkedAt')
  };
}

function normalizeCapabilityNode(value) {
  const node = objectValue(value, 'CapabilityNode');
  return {
    nodeId: textValue(node.nodeId, 'nodeId'),
    kind: enumValue(node.kind, { allowed: NODE_KINDS, field: 'kind' }),
    capabilities: listValue(node.capabilities, 'capabilities'),
    inputs: listValue(node.inputs, 'inputs'),
    outputs: listValue(node.outputs, 'outputs'),
    requirements: listValue(node.requirements, 'requirements'),
    providers: normalizeProviders(node.providers),
    evidenceRequirements: listValue(node.evidenceRequirements, 'evidenceRequirements'),
    state: enumValue(node.state, { allowed: NODE_STATES, field: 'state', fallback: 'DISCOVERED' }),
    availability: normalizeAvailability(node.availability),
    reliability: numberValue(node.reliability, 'reliability', { maximum: 1, fallback: 0.5 }),
    cost: numberValue(node.cost, 'cost', { fallback: 0 }),
    latency: numberValue(node.latency, 'latency', { fallback: 0 }),
    localContext: objectOrEmpty(node.localContext, 'localContext'),
    provenance: listValue(node.provenance, 'provenance')
  };
}

module.exports = { normalizeCapabilityNode, normalizeProvider };
