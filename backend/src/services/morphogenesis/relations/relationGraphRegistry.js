'use strict';

const RELATION_GRAPH_KINDS = Object.freeze(['communication', 'authority', 'state', 'evidence', 'resource', 'migration']);

function createRelationGraph(kind, edges = []) {
  if (!RELATION_GRAPH_KINDS.includes(kind)) throw new Error(`unsupported relation graph: ${kind}`);
  const validated = edges.map((edge) => {
    if (!edge || !edge.from || !edge.to || !edge.relation) throw new Error('relation edges require from, to and relation');
    return { from: edge.from, to: edge.to, relation: edge.relation, evidenceRef: edge.evidenceRef || null };
  });
  return { kind, edges: validated };
}

function canRelate(graph, query) {
  return graph.edges.some((edge) => edge.from === query.from && edge.to === query.to && edge.relation === query.relation);
}

module.exports = { RELATION_GRAPH_KINDS, canRelate, createRelationGraph };
