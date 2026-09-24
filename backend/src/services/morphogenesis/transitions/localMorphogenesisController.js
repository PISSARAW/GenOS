'use strict';

const { authorizeLocalMorphogenesis } = require('./morphogenesisLease');
const { transitionMorphology } = require('./morphologyTransitionService');

function operationTargets(patch) {
  return patch.operations.flatMap((operation) => [
    operation.nodeId, operation.sourceNodeId, operation.targetNodeId
  ].filter(Boolean));
}

function buildAuthorizationRequest(input) {
  const patch = input.context.patch;
  return {
    ...input.request,
    nodeId: input.lease.nodeId,
    affectedNodeIds: [...new Set(operationTargets(patch))],
    operations: patch.operations,
    graphContext: input.context.graph
  };
}

async function runLocalMorphogenesis(input) {
  const authorization = authorizeLocalMorphogenesis(input.lease, buildAuthorizationRequest(input));
  if (!authorization.allowed) return { committed: false, authorization };
  return transitionMorphology(input.context, input.adapters);
}

module.exports = { runLocalMorphogenesis };
