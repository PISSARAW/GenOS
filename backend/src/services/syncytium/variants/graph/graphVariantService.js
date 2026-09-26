'use strict';

const schemaService = require('../../../syncytiumSchemaService');

function createGraphVariantService(syncytium) {
  return {
    createGraphSession: (mission, options = {}) => syncytium.createSession(mission, { ...options, schema: graphSchema() }),
    addGraphNode: (sessionId, request) => mutateGraph({ sessionId, request, collection: 'graph_nodes', idField: 'nodeId', syncytium }),
    updateGraphNode: (sessionId, request) => mutateGraph({ sessionId, request, collection: 'graph_nodes', idField: 'nodeId', syncytium }),
    removeGraphNode: (sessionId, request) => mutateGraph({ sessionId, request, collection: 'graph_nodes', idField: 'nodeId', action: 'delete', syncytium }),
    addGraphEdge: (sessionId, request) => mutateGraph({ sessionId, request, collection: 'graph_edges', idField: 'edgeId', syncytium }),
    removeGraphEdge: (sessionId, request) => mutateGraph({ sessionId, request, collection: 'graph_edges', idField: 'edgeId', action: 'delete', syncytium }),
    graphSnapshot: (sessionId, options = {}) => graphSnapshot(sessionId, options, syncytium),
    projectGraph: (sessionId, query, options = {}) => projectGraph({ sessionId, query, options, syncytium })
  };
}

async function mutateGraph(context) {
  const { sessionId, request, collection, idField, action = 'set', syncytium } = context;
  validateIdentity(request, idField, action);
  const value = action === 'delete' ? null : { ...request.value, [idField]: request.id };
  return syncytium.applyOperation(sessionId, {
    opId: request.opId,
    actorId: request.actorId,
    graphRules: { acyclic: request.acyclic === true },
    kind: { type: 'typed_field', key: collection, action, entryKey: request.id, value }
  }, request.options || {});
}

async function graphSnapshot(sessionId, options, syncytium) {
  const snapshot = await syncytium.snapshot(sessionId, options);
  const fields = snapshot.shared.sharedFields;
  return {
    ...snapshot,
    graph: {
      nodes: objectValues(fields.graph_nodes),
      edges: objectValues(fields.graph_edges)
    }
  };
}

async function projectGraph(context) {
  const { sessionId, query = {}, options = {}, syncytium } = context;
  validateQuery(query);
  const snapshot = await graphSnapshot(sessionId, options, syncytium);
  const nodes = new Map(snapshot.graph.nodes.map((node) => [node.nodeId, node]));
  const edges = snapshot.graph.edges.filter((edge) => !query.edgeTypes || query.edgeTypes.includes(edge.type));
  const reachable = query.startNodeId ? traverse(query.startNodeId, edges, query.maxDepth ?? 8) : new Set(nodes.keys());
  return {
    ...snapshot,
    graphProjection: {
      startNodeId: query.startNodeId || null,
      nodes: [...reachable].map((nodeId) => nodes.get(nodeId)).filter(Boolean),
      edges: edges.filter((edge) => reachable.has(edge.source) && reachable.has(edge.target))
    }
  };
}

function validateQuery(query) {
  validateStartNode(query.startNodeId);
  validateDepth(query.maxDepth === undefined ? 8 : query.maxDepth);
  validateEdgeTypes(query.edgeTypes);
}

function validateStartNode(startNodeId) {
  if (startNodeId !== undefined && (typeof startNodeId !== 'string' || !startNodeId)) {
    throw graphError('SYNCYTIUM_GRAPH_QUERY_INVALID', 'Graph projection startNodeId must be a non-empty string.');
  }
}

function validateDepth(depth) {
  if (!Number.isSafeInteger(depth) || depth < 0 || depth > 1000) {
    throw graphError('SYNCYTIUM_GRAPH_QUERY_INVALID', 'Graph projection maxDepth must be between 0 and 1000.');
  }
}

function validateEdgeTypes(edgeTypes) {
  if (edgeTypes !== undefined && (!Array.isArray(edgeTypes) || edgeTypes.some((type) => typeof type !== 'string'))) {
    throw graphError('SYNCYTIUM_GRAPH_QUERY_INVALID', 'Graph projection edgeTypes must be a list of strings.');
  }
}

function traverse(startNodeId, edges, maxDepth) {
  const visited = new Set([startNodeId]);
  let frontier = [startNodeId];
  for (let depth = 0; depth < maxDepth && frontier.length; depth += 1) {
    frontier = edges.filter((edge) => frontier.includes(edge.source) && !visited.has(edge.target)).map((edge) => edge.target);
    frontier.forEach((nodeId) => visited.add(nodeId));
  }
  return visited;
}

function validateIdentity(request, idField, action) {
  if (!hasIdentity(request)) throw graphError('SYNCYTIUM_GRAPH_OPERATION_INVALID', 'Graph operation requires opId, actorId and id.');
  if (requiresValue(action) && invalidValue(request.value)) {
    throw graphError('SYNCYTIUM_GRAPH_OPERATION_INVALID', 'Graph nodes and edges require an object value.');
  }
  if (requiresEndpoints(idField, action) && missingEndpoints(request.value)) {
    throw graphError('SYNCYTIUM_GRAPH_OPERATION_INVALID', 'Graph edges require source and target node identifiers.');
  }
}

function hasIdentity(request) {
  return Boolean(request?.opId && request.actorId && request.id);
}

function requiresValue(action) {
  return action !== 'delete';
}

function invalidValue(value) {
  return !value || typeof value !== 'object' || Array.isArray(value);
}

function requiresEndpoints(idField, action) {
  return idField === 'edgeId' && action !== 'delete';
}

function missingEndpoints(value) {
  return !value.source || !value.target;
}

function objectValues(value) {
  return Object.values(value || {}).sort((left, right) => String(left.nodeId || left.edgeId).localeCompare(String(right.nodeId || right.edgeId)));
}

function graphSchema() {
  return schemaService.compile({ schemaId: 'syncytium-graph-v1', fields: {
    graph_nodes: { dataType: 'MAP', consistencyZone: 'INVARIANT_PRESERVING' },
    graph_edges: { dataType: 'MAP', consistencyZone: 'INVARIANT_PRESERVING' }
  } });
}

function graphError(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { createGraphVariantService };
