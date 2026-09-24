'use strict';

const { nodesById, parentOf } = require('./typingHelpers');

function checkResources(graph) {
  const byId = nodesById(graph);
  const nodeErrors = (graph.nodes || []).flatMap((node) => nodeResourceErrors(node, byId).concat(rhizomeGrowthErrors(node, graph)));
  return nodeErrors.concat((graph.edges || []).flatMap(resourceEdgeErrors));
}

function rhizomeGrowthErrors(node, graph) {
  if (String(node.topology).toLowerCase() !== 'rhizome') return [];
  const growth = node.budget && node.budget.growth;
  const globalGrowth = graph.globalBudget && graph.globalBudget.growth;
  return Number(growth || globalGrowth) > 0 ? [] : [`rhizome node ${node.nodeId} requires a growth budget`];
}

function nodeResourceErrors(node, byId) {
  const parent = parentOf(node, byId);
  const allocation = parent && parent.budget;
  if (!allocation || !node.budget) return [];
  return Object.entries(node.budget).flatMap(([resource, amount]) => {
    const exceeds = Number.isFinite(amount) && Number.isFinite(allocation[resource]) && amount > allocation[resource];
    return exceeds ? [`node ${node.nodeId} exceeds parent ${resource} allocation`] : [];
  });
}

function resourceEdgeErrors(edge) {
  if (edge.type !== 'ALLOCATES_RESOURCE') return [];
  const allocation = edge.properties && edge.properties.amount;
  if (!Number.isFinite(allocation) || allocation < 0) return [`resource edge ${edge.edgeId} requires a non-negative amount`];
  return [];
}

module.exports = { checkResources };
