'use strict';

function detect(context) {
  const operation = context.operation;
  if (operation.fieldType !== 'MAP' || !['graph_nodes', 'graph_edges'].includes(operation.kind?.key)) return [];
  const graph = materialize(context.history);
  if (operation.kind.key === 'graph_nodes') return validateNodeMutation(operation, graph);
  return validateEdgeMutation(operation, graph);
}

function materialize(history) {
  const graph = { nodes: {}, edges: {} };
  const mutations = history.filter(isGraphMutation).sort(compareOperations);
  for (const operation of mutations) {
    const collection = operation.kind.key === 'graph_nodes' ? graph.nodes : graph.edges;
    const id = operation.kind.entryKey;
    if (operation.kind.action === 'delete') delete collection[id];
    else collection[id] = operation.kind.value;
  }
  return graph;
}

function isGraphMutation(operation) {
  return operation.fieldType === 'MAP' && ['graph_nodes', 'graph_edges'].includes(operation.kind?.key);
}

function compareOperations(left, right) {
  return (left.lamport || 0) - (right.lamport || 0)
    || String(left.actorId).localeCompare(String(right.actorId))
    || String(left.opId).localeCompare(String(right.opId));
}

function validateNodeMutation(operation, graph) {
  const { action, entryKey, value } = operation.kind;
  if (action === 'delete') {
    return Object.values(graph.edges).some((edge) => edge.source === entryKey || edge.target === entryKey)
      ? [{ type: 'GRAPH_DANGLING_EDGE', nodeId: entryKey }] : [];
  }
  return value?.nodeId === entryKey ? [] : [{ type: 'GRAPH_NODE_ID_MISMATCH', nodeId: entryKey }];
}

function validateEdgeMutation(operation, graph) {
  const { action, entryKey, value } = operation.kind;
  if (action === 'delete') return [];
  const identity = validateEdgeIdentity(entryKey, value);
  if (identity) return [identity];
  const endpoints = validateEndpoints(value, graph.nodes);
  if (endpoints.length) return endpoints;
  graph.edges[entryKey] = value;
  return operation.graphRules?.acyclic && hasCycle(graph) ? [{ type: 'GRAPH_CYCLE', edgeId: entryKey }] : [];
}

function validateEdgeIdentity(entryKey, value) {
  return value?.edgeId === entryKey ? null : { type: 'GRAPH_EDGE_ID_MISMATCH', edgeId: entryKey };
}

function validateEndpoints(edge, nodes) {
  return [edge.source, edge.target].filter((nodeId) => !nodes[nodeId])
    .map((nodeId) => ({ type: 'GRAPH_DANGLING_EDGE', edgeId: edge.edgeId, nodeId }));
}

function hasCycle(graph) {
  const outgoing = Object.values(graph.edges).reduce((result, edge) => {
    result[edge.source] = [...(result[edge.source] || []), edge.target];
    return result;
  }, {});
  return Object.keys(outgoing).some((nodeId) => reachesItself(nodeId, outgoing));
}

function reachesItself(start, outgoing) {
  const pending = [...(outgoing[start] || [])];
  const visited = new Set();
  while (pending.length) {
    const node = pending.pop();
    if (node === start) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    pending.push(...(outgoing[node] || []));
  }
  return false;
}

module.exports = { detect };
