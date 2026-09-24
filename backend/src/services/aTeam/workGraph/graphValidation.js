'use strict';

const { isRecord, isNonEmpty, isStringList, result } = require('../contracts/contractValidation');
const { validateWorkNode } = require('../contracts/workNodeContract');

function validateWorkGraph(graph) {
  const errors = [];
  if (!isRecord(graph)) return result(['WorkGraph must be an object.']);
  validateGraphIdentity(graph, errors);
  const nodeIndex = indexNodes(graph.nodes, errors);
  validateEdges(graph.edges, nodeIndex, errors);
  if (errors.length) return result(errors);
  if (hasCycle(graph.nodes, graph.edges)) errors.push('WorkGraph must be acyclic.');
  return result(errors);
}

function validateGraphIdentity(graph, errors) {
  if (!isNonEmpty(graph.workGraphId)) errors.push('workGraphId is required.');
  if (graph.teamRunId !== null && graph.teamRunId !== undefined && !isNonEmpty(graph.teamRunId)) errors.push('teamRunId must be a string or null.');
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) errors.push('WorkGraph requires at least one node.');
  if (!Array.isArray(graph.edges)) errors.push('WorkGraph edges must be an array.');
}

function indexNodes(nodes, errors) {
  const index = new Map();
  if (!Array.isArray(nodes)) return index;
  nodes.forEach((node, position) => {
    const validation = validateWorkNode(node);
    validation.errors.forEach((error) => errors.push(`nodes[${position}]: ${error}`));
    if (index.has(node?.nodeId)) errors.push(`Duplicate WorkGraph node '${node?.nodeId}'.`);
    if (node?.nodeId) index.set(node.nodeId, node);
  });
  return index;
}

function validateEdges(edges, nodes, errors) {
  if (!Array.isArray(edges)) return;
  const edgeIds = new Set();
  edges.forEach((edge, position) => {
    validateEdge({ edge, position, nodes, edgeIds, errors });
  });
}

function validateEdge(context) {
  const { edge, position, nodes, edgeIds, errors } = context;
  if (!isRecord(edge)) {
    errors.push(`edges[${position}] must be an object.`);
    return;
  }
  validateEdgeEndpoints(context);
  validateEdgeContract(context);
  registerEdgeId(context);
}

function validateEdgeEndpoints({ edge, position, nodes, errors }) {
  if (!isNonEmpty(edge.fromNode) || !isNonEmpty(edge.toNode)) errors.push(`edges[${position}] requires fromNode and toNode.`);
  if (edge.fromNode === edge.toNode) errors.push(`edges[${position}] cannot loop to the same node.`);
  if (!nodes.has(edge.fromNode) || !nodes.has(edge.toNode)) errors.push(`edges[${position}] references an unknown node.`);
}

function validateEdgeContract({ edge, position, errors }) {
  if (!isNonEmpty(edge.contractType)) errors.push(`edges[${position}] requires contractType.`);
  if (edge.blocking !== undefined && typeof edge.blocking !== 'boolean') errors.push(`edges[${position}].blocking must be boolean.`);
  if (edge.requiredArtifact !== undefined && !isNonEmpty(edge.requiredArtifact)) errors.push(`edges[${position}].requiredArtifact must be non-empty.`);
  if (edge.requiredEvidence !== undefined && !isStringList(edge.requiredEvidence)) errors.push(`edges[${position}].requiredEvidence must be a string list.`);
}

function registerEdgeId({ edge, edgeIds, errors }) {
  const edgeId = edge.edgeId || `${edge.fromNode}->${edge.toNode}`;
  if (edgeIds.has(edgeId)) errors.push(`Duplicate WorkGraph edge '${edgeId}'.`);
  edgeIds.add(edgeId);
}

function hasCycle(nodes, edges) {
  const remaining = new Map(nodes.map((node) => [node.nodeId, 0]));
  const outgoing = new Map(nodes.map((node) => [node.nodeId, []]));
  edges.filter((edge) => edge.blocking !== false).forEach((edge) => {
    remaining.set(edge.toNode, remaining.get(edge.toNode) + 1);
    outgoing.get(edge.fromNode).push(edge.toNode);
  });
  const ready = [...remaining].filter(([, count]) => count === 0).map(([id]) => id);
  let visited = 0;
  while (ready.length) {
    const current = ready.shift();
    visited += 1;
    outgoing.get(current).forEach((target) => {
      remaining.set(target, remaining.get(target) - 1);
      if (remaining.get(target) === 0) ready.push(target);
    });
  }
  return visited !== nodes.length;
}

module.exports = { validateWorkGraph, hasCycle };
