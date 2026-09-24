'use strict';

const { randomUUID } = require('crypto');

const NODE_KINDS = Object.freeze([
  'PRIMITIVE', 'PROCEDURE', 'TOOL', 'DIRECT_WORKER', 'TOPOLOGY', 'COMPOSITION', 'SUB_ORCHESTRATOR'
]);

function valueOr(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

function createMorphologyNode(input = {}) {
  const node = {
    nodeId: valueOr(input.nodeId, randomUUID()),
    kind: valueOr(input.kind, input.topology ? 'TOPOLOGY' : 'PRIMITIVE'),
    topology: valueOr(input.topology, null),
    variant: valueOr(input.variant, null),
    scope: valueOr(input.scope, null),
    mission: valueOr(input.mission, null),
    parentNodeId: valueOr(input.parentNodeId, null),
    workers: Array.isArray(input.workers) ? [...input.workers] : [],
    capabilities: Array.isArray(input.capabilities) ? [...input.capabilities] : [],
    inputContract: valueOr(input.inputContract, null),
    outputContract: valueOr(input.outputContract, null),
    authorityBoundary: valueOr(input.authorityBoundary, null),
    stateBoundary: valueOr(input.stateBoundary, null),
    evidencePolicy: valueOr(input.evidencePolicy, null),
    communicationPolicy: valueOr(input.communicationPolicy, null),
    budget: valueOr(input.budget, {}),
    lifecycle: valueOr(input.lifecycle, 'proposed'),
    localProfile: valueOr(input.localProfile, null),
    health: valueOr(input.health, null)
  };
  if (!NODE_KINDS.includes(node.kind)) throw new Error(`Unsupported morphology node kind: ${node.kind}`);
  return node;
}

module.exports = { NODE_KINDS, createMorphologyNode };
