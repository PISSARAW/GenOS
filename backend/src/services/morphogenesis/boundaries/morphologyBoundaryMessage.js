'use strict';

const MESSAGE_KINDS = Object.freeze(['REQUEST', 'RESULT', 'EVIDENCE', 'STATE_DELTA', 'CONSTRAINT']);

function createBoundaryMessage(input = {}) {
  if (!hasValidEndpoints(input)) {
    throw new Error('boundary message requires endpoints and a supported kind');
  }
  return {
    senderNode: input.senderNode, receiverNode: input.receiverNode, kind: input.kind,
    claims: input.claims || [], artifacts: input.artifacts || [], requests: input.requests || [],
    constraints: input.constraints || [], evidenceRefs: input.evidenceRefs || [],
    stateDeltaRefs: input.stateDeltaRefs || [], risk: normalizeRisk(input.risk)
  };
}

function hasValidEndpoints(input) {
  return Boolean(input.senderNode && input.receiverNode && MESSAGE_KINDS.includes(input.kind));
}

function normalizeRisk(risk) {
  return Number.isFinite(risk) ? Math.max(0, Math.min(1, risk)) : 1;
}

module.exports = { MESSAGE_KINDS, createBoundaryMessage };
