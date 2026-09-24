'use strict';

const { contractFor, nodesById } = require('./typingHelpers');

function checkIndependence(graph, contracts = {}) {
  const byId = nodesById(graph);
  const nodeErrors = (graph.nodes || []).flatMap((node) => independenceNodeErrors(node, graph, contracts));
  return nodeErrors.concat((graph.edges || []).flatMap((edge) => communicationErrors(edge, byId, contracts)));
}

function independenceNodeErrors(parent, graph, contracts) {
  const model = contractFor(parent, contracts).independenceModel || {};
  if (model.required !== true) return [];
  const children = (graph.nodes || []).filter((node) => node.parentNodeId === parent.nodeId);
  const scopes = children.map((node) => node.scope).filter(Boolean);
  const errors = [];
  if (new Set(scopes).size !== scopes.length) errors.push(`topology ${parent.topology} has duplicate independent scopes`);
  if (children.some((node) => node.independenceVerified !== true && !node.independenceEvidence)) {
    errors.push(`topology ${parent.topology} requires evidence of child independence`);
  }
  return errors;
}

function communicationErrors(edge, byId, contracts) {
  if (edge.type !== 'COMMUNICATES') return [];
  const source = byId.get(edge.fromNodeId);
  const target = byId.get(edge.toNodeId);
  if (!source.parentNodeId || source.parentNodeId !== target.parentNodeId) return [];
  const owner = byId.get(source.parentNodeId);
  const model = contractFor(owner, contracts).independenceModel || {};
  if (model.required && !(edge.properties && edge.properties.firewall)) {
    return [`communication edge ${edge.edgeId} crosses independent branches without a firewall`];
  }
  return [];
}

module.exports = { checkIndependence };
