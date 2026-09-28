'use strict';

const { validateWorkGraph } = require('../workGraph/graphValidation');

function graphRequirements(graph, nodes) {
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  return nodes.flatMap((node) => (node.requiredCapabilities || []).map((name) => ({
    name,
    weight: node.criticality === 'high' ? 2 : 1,
    dependsOn: edges.filter((edge) => edge.toNode === node.nodeId)
      .flatMap((edge) => nodes.find((source) => source.nodeId === edge.fromNode)?.requiredCapabilities || [])
  })));
}

function extract(input = {}) {
  const graph = input.workGraph;
  const validation = graph ? validateWorkGraph(graph) : null;
  if (validation && !validation.valid) return { requirements: [], validation };
  const explicit = Array.isArray(input.capabilityRequirements) ? input.capabilityRequirements : null;
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const raw = explicit || graphRequirements(graph, nodes);
  return { requirements: uniqueRequirements(raw), validation: validation || null };
}

function uniqueRequirements(raw) {
  const seen = new Set();
  return raw.map((item) => typeof item === 'string' ? { name: item } : item)
    .filter((item) => item && String(item.name || item.capability || '').trim())
    .map((item) => ({ ...item, name: String(item.name || item.capability).trim() }))
    .filter((item) => { if (seen.has(item.name)) return false; seen.add(item.name); return true; });
}

function specialistsFor(input) {
  const supplied = Array.isArray(input.availableSpecialists) ? input.availableSpecialists : [];
  const nodes = Array.isArray(input.workGraph?.nodes) ? input.workGraph.nodes : [];
  const assigned = nodes.filter((node) => node.ownerAgentId).map((node) => ({
    agentId: node.ownerAgentId, role: node.role || node.domain || 'work_graph_specialist',
    capabilities: node.requiredCapabilities || [], modelTier: node.modelTier || 'standard'
  }));
  return [...new Map([...supplied, ...assigned].map((candidate) => [candidate.agentId || candidate.id, candidate])).values()];
}

module.exports = { extract, specialistsFor };
