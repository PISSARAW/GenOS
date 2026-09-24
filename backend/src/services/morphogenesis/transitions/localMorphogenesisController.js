'use strict';

const { LEASE_ERROR, authorizeLocalMorphogenesis } = require('./morphogenesisLease');
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
  if (typeof input.verifyLease !== 'function') return verifierRequired();
  const verified = await input.verifyLease(input.lease);
  if (!verified || verified.valid !== true) return verificationFailed();
  const authorization = authorizeLocalMorphogenesis(input.lease, buildAuthorizationRequest(input));
  if (!authorization.allowed) return { committed: false, authorization };
  return transitionMorphology(input.context, input.adapters);
}

function verifierRequired() {
  return { committed: false, authorization: { allowed: false, code: LEASE_ERROR, errors: ['issuing authority lease verifier is required'] } };
}

function verificationFailed() {
  return { committed: false, authorization: { allowed: false, code: LEASE_ERROR, errors: ['lease was not verified by the issuing authority'] } };
}

module.exports = { runLocalMorphogenesis };
