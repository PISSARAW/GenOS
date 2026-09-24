'use strict';

const { nodesById } = require('./typingHelpers');

function checkEvidence(graph) {
  const byId = nodesById(graph);
  return (graph.edges || []).flatMap((edge) => evidenceEdgeErrors(edge, byId));
}

function evidenceEdgeErrors(edge, byId) {
  if (edge.type !== 'EXCHANGES_EVIDENCE') return [];
  const source = byId.get(edge.fromNodeId);
  const target = byId.get(edge.toNodeId);
  const produced = source && source.evidencePolicy && source.evidencePolicy.produces;
  const accepted = target && target.evidencePolicy && target.evidencePolicy.accepts;
  const errors = [];
  if (incompatibleEvidence(produced, accepted)) errors.push(`evidence edge ${edge.edgeId} carries unsupported evidence types`);
  if (requiresEvidence(target) && !Array.isArray(produced)) errors.push(`evidence edge ${edge.edgeId} has no declared source evidence`);
  return errors;
}

function incompatibleEvidence(produced, accepted) {
  return Array.isArray(produced) && Array.isArray(accepted) && produced.some((item) => !accepted.includes(item));
}

function requiresEvidence(target) {
  return Boolean(target && target.evidencePolicy && target.evidencePolicy.required === true);
}

module.exports = { checkEvidence };
