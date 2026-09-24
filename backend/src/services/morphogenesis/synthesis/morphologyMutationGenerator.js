'use strict';

const MUTATION_TYPES = Object.freeze([
  'ADD_LOCAL_TRINITY', 'CHANGE_VARIANT', 'SPLIT_SUBTREE', 'MERGE_REGIONS',
  'REPLACE_A_TEAM_WITH_SYNCYTIUM', 'REMOVE_TOPOLOGY', 'ADD_BRIDGE'
]);

function nodeMap(graph) {
  return new Map((graph.nodes || []).map((node) => [node.nodeId, node]));
}

function isDescendant(graph, nodeId, ancestorId) {
  const byId = nodeMap(graph);
  let current = byId.get(nodeId);
  while (current && current.parentNodeId) {
    if (current.parentNodeId === ancestorId) return true;
    current = byId.get(current.parentNodeId);
  }
  return false;
}

function addTrinityValidation() {
  return null;
}

function variantValidation(request, graph, target) {
  return request.variant && request.variant !== target.variant ? null : 'new variant is missing or unchanged';
}

function splitValidation(request, graph, target) {
  return isDescendant(graph, request.splitAtNodeId, target.nodeId) ? null : 'split point must be inside the target subtree';
}

function mergeValidation(request, graph, target) {
  const other = (graph.nodes || []).find((node) => node.nodeId === request.otherNodeId);
  return mergeError(target, other);
}

function replacementValidation(request, graph, target) {
  return isATeam(target) ? null : 'target is not an A-Team topology';
}

function removalValidation(request, graph, target) {
  return removableTopology(target, graph) ? null : 'only a leaf non-root topology can be removed';
}

function bridgeValidation(request, graph, target) {
  return validBridge(request, graph) ? null : 'bridge requires an adapter and distinct existing endpoints';
}

const MUTATION_VALIDATORS = Object.freeze({
  ADD_LOCAL_TRINITY: addTrinityValidation,
  CHANGE_VARIANT: variantValidation,
  SPLIT_SUBTREE: splitValidation,
  MERGE_REGIONS: mergeValidation,
  REPLACE_A_TEAM_WITH_SYNCYTIUM: replacementValidation,
  REMOVE_TOPOLOGY: removalValidation,
  ADD_BRIDGE: bridgeValidation
});

function validateMutation(request, graph, byId) {
  if (!request || typeof request !== 'object') return 'mutation request must be an object';
  const target = byId.get(request.nodeId);
  if (!target) return 'target node does not exist';
  const validate = MUTATION_VALIDATORS[request.type];
  return validate ? validate(request, graph, target) : 'unsupported local mutation';
}

function isATeam(target) {
  return target.kind === 'TOPOLOGY' && ['a_team', 'a-team'].includes(String(target.topology).toLowerCase());
}

function removableTopology(target, graph) {
  const hasChildren = (graph.nodes || []).some((node) => node.parentNodeId === target.nodeId);
  return target.kind === 'TOPOLOGY' && target.nodeId !== graph.rootNodeId && !hasChildren;
}

function validBridge(request, graph) {
  return Boolean(request.adapterId && request.fromNodeId !== request.toNodeId
    && (graph.nodes || []).some((node) => node.nodeId === request.fromNodeId)
    && (graph.nodes || []).some((node) => node.nodeId === request.toNodeId));
}

function mergeError(target, other) {
  if (!other) return 'second merge region does not exist';
  return target.nodeId !== other.nodeId && target.parentNodeId === other.parentNodeId
    ? null : 'merge regions must be distinct siblings';
}

function mutationKey(request) {
  return [request.type, request.nodeId, request.otherNodeId, request.variant, request.splitAtNodeId,
    request.fromNodeId, request.toNodeId, request.adapterId].join('|');
}

function generateLocalMutations(graph, requests = [], limit = 7) {
  const byId = nodeMap(graph);
  const accepted = [];
  const rejected = [];
  const seen = new Set();
  const boundedLimit = Math.max(0, Math.min(limit, MUTATION_TYPES.length));
  const boundedRequests = Array.isArray(requests) ? requests.slice(0, MUTATION_TYPES.length * 4) : [];
  for (const request of boundedRequests) {
    const reason = validateMutation(request, graph, byId);
    if (reason) rejected.push({ request, reason });
    else if (!seen.has(mutationKey(request)) && accepted.length < boundedLimit) {
      seen.add(mutationKey(request));
      accepted.push({ id: `local-${accepted.length + 1}`, origin: 'local_mutation', mutation: { ...request } });
    }
  }
  return { candidates: accepted, rejected, bounded: true };
}

module.exports = { MUTATION_TYPES, generateLocalMutations };
