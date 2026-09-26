'use strict';

const { randomUUID } = require('crypto');

const NODE_KINDS = Object.freeze([
  'TOPOLOGY',
  'OPERATOR',
  'GATE',
  'ADAPTER',
  'ENVIRONMENT',
  'DIRECT_WORKER'
]);

const PORT_TYPES = Object.freeze([
  'INPUT',
  'OUTPUT',
  'STATE',
  'EVIDENCE',
  'CONTROL',
  'RESOURCE'
]);

const PORT_DIRECTIONS = Object.freeze(['in', 'out', 'bidirectional']);

function valueOr(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

function mapPorts(arr) {
  return Array.isArray(arr) ? arr.map(createPort) : [];
}

function createMorphologyNode(input = {}) {
  const node = {
    nodeId: valueOr(input.nodeId, randomUUID()),
    kind: valueOr(input.kind, input.topology ? 'TOPOLOGY' : 'DIRECT_WORKER'),
    topology: valueOr(input.topology, null),
    variant: valueOr(input.variant, null),
    operator: valueOr(input.operator, null),
    scope: valueOr(input.scope, null),
    mission: valueOr(input.mission, null),
    parentNodeId: valueOr(input.parentNodeId, null),
    children: Array.isArray(input.children) ? [...input.children] : [],
    workers: Array.isArray(input.workers) ? [...input.workers] : [],
    capabilities: Array.isArray(input.capabilities) ? [...input.capabilities] : [],
    inputPorts: mapPorts(input.inputPorts),
    outputPorts: mapPorts(input.outputPorts),
    statePorts: mapPorts(input.statePorts),
    evidencePorts: mapPorts(input.evidencePorts),
    controlPorts: mapPorts(input.controlPorts),
    resourcePorts: mapPorts(input.resourcePorts),
    authorityBoundary: valueOr(input.authorityBoundary, null),
    stateBoundary: valueOr(input.stateBoundary, null),
    evidencePolicy: valueOr(input.evidencePolicy, null),
    communicationPolicy: valueOr(input.communicationPolicy, null),
    resourcePolicy: valueOr(input.resourcePolicy, null),
    lifecyclePolicy: valueOr(input.lifecyclePolicy, null),
    budget: valueOr(input.budget, {}),
    lifecycle: valueOr(input.lifecycle, 'proposed'),
    observables: Array.isArray(input.observables) ? [...input.observables] : [],
    localProfile: valueOr(input.localProfile, null),
    health: valueOr(input.health, null)
  };
  if (!NODE_KINDS.includes(node.kind)) throw new Error(`Unsupported morphology node kind: ${node.kind}`);
  return node;
}

function createPort(input = {}) {
  return {
    portId: valueOr(input.portId, randomUUID()),
    name: valueOr(input.name, ''),
    type: valueOr(input.type, 'INPUT'),
    direction: valueOr(input.direction, 'in'),
    schema: valueOr(input.schema, {}),
    required: valueOr(input.required, false),
    connectedTo: valueOr(input.connectedTo, null)
  };
}

function validatePort(port) {
  if (!port || typeof port !== 'object') return { valid: false, errors: ['Port must be an object'] };
  const errors = [];
  if (!port.name || typeof port.name !== 'string') errors.push('Port requires a name');
  if (!PORT_TYPES.includes(port.type)) errors.push(`Invalid port type: ${port.type}. Must be one of ${PORT_TYPES.join(', ')}`);
  if (!PORT_DIRECTIONS.includes(port.direction)) errors.push(`Invalid port direction: ${port.direction}. Must be one of ${PORT_DIRECTIONS.join(', ')}`);
  return { valid: errors.length === 0, errors };
}

function connectPorts(outputPort, inputPort) {
  if (outputPort.direction !== 'out' && outputPort.direction !== 'bidirectional') throw new Error('Output port must have direction out or bidirectional');
  if (inputPort.direction !== 'in' && inputPort.direction !== 'bidirectional') throw new Error('Input port must have direction in or bidirectional');
  outputPort.connectedTo = inputPort.portId;
  inputPort.connectedTo = outputPort.portId;
  return { outputPort, inputPort };
}

module.exports = { NODE_KINDS, PORT_TYPES, PORT_DIRECTIONS, createMorphologyNode, createPort, validatePort, connectPorts };
