'use strict';

function compileProgramWorkGraph(teams = [], contracts = []) {
  const nodes = (Array.isArray(teams) ? teams : []).map((team) => ({ nodeId: `team:${team.teamId}`, teamId: team.teamId, objective: team.objective || null }));
  const edges = (Array.isArray(contracts) ? contracts : []).map((contract) => ({
    fromNode: `team:${contract.fromTeamId}`,
    toNode: `team:${contract.toTeamId}`,
    contractId: contract.contractId || null,
    artifacts: contract.provides || [],
    blocking: contract.blocking !== false
  }));
  return { nodes, edges, topologicalLayers: layers(nodes, edges) };
}

function layers(nodes, edges) {
  const remaining = new Set(nodes.map((node) => node.nodeId));
  const result = [];
  while (remaining.size) {
    const ready = [...remaining].filter((node) => !edges.some((edge) => edge.toNode === node && remaining.has(edge.fromNode)));
    if (!ready.length) throw Object.assign(new Error('Program work graph contains a cycle.'), { code: 'ATEAM_MTS_CYCLE' });
    result.push(ready);
    ready.forEach((node) => remaining.delete(node));
  }
  return result;
}

module.exports = { compileProgramWorkGraph };
