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
    graphSnapshot: (sessionId, options = {}) => graphSnapshot(sessionId, options, syncytium)
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
