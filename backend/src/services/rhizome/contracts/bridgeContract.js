'use strict';

const { objectValue, textValue, enumValue, listValue, numberValue } = require('./validation');

const BRIDGE_TYPES = Object.freeze([
  'SCHEMA_ADAPTER', 'LANGUAGE_TRANSLATOR', 'PROTOCOL_ADAPTER', 'REPRESENTATION_CONVERTER',
  'SECURITY_GATEWAY', 'MEMORY_BRIDGE', 'MODEL_BRIDGE'
]);

function normalizeBridge(value) {
  const bridge = objectValue(value, 'Bridge');
  return {
    bridgeId: textValue(bridge.bridgeId, 'bridgeId'),
    type: enumValue(bridge.type, { allowed: BRIDGE_TYPES, field: 'type' }),
    fromNodeId: textValue(bridge.fromNodeId, 'fromNodeId'),
    toNodeId: textValue(bridge.toNodeId, 'toNodeId'),
    sourceCapability: textValue(bridge.sourceCapability, 'sourceCapability'),
    targetCapability: textValue(bridge.targetCapability, 'targetCapability'),
    inputContract: textValue(bridge.inputContract, 'inputContract'),
    outputContract: textValue(bridge.outputContract, 'outputContract'),
    invariants: listValue(bridge.invariants, 'invariants'),
    sourceRepresentation: optionalText(bridge.sourceRepresentation),
    targetRepresentation: optionalText(bridge.targetRepresentation),
    roundTripRequired: bridge.roundTripRequired === true,
    maxInformationLoss: numberValue(bridge.maxInformationLoss, 'maxInformationLoss', { maximum: 1, fallback: 0.1 }),
    ephemeral: bridge.ephemeral !== false
  };
}

function optionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

module.exports = { BRIDGE_TYPES, normalizeBridge };
