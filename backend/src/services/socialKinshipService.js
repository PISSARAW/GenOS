'use strict';

function requiredScope(input) {
  const organizationId = String(input.organizationId || '').trim();
  const projectId = String(input.projectId || '').trim();
  if (!organizationId || !projectId) throw new Error('Organization and project scope are required.');
  return { organizationId, projectId };
}

async function loadLineage(db, scope) {
  return db.all(
    `SELECT source_agent_id AS sourceAgentId, target_agent_id AS targetAgentId, relation_type AS relationType
     FROM agent_relations WHERE organization_id = ? AND project_id = ?
       AND relation_type IN ('parent', 'child', 'sibling', 'twin')`,
    [scope.organizationId, scope.projectId]
  );
}

function parentsOf(agentId, edges) {
  return edges.flatMap((edge) => {
    if (edge.relationType === 'parent' && edge.targetAgentId === agentId) return [edge.sourceAgentId];
    if (edge.relationType === 'child' && edge.sourceAgentId === agentId) return [edge.targetAgentId];
    return [];
  });
}

function childrenOf(agentId, edges) {
  return edges.flatMap((edge) => {
    if (edge.relationType === 'parent' && edge.sourceAgentId === agentId) return [edge.targetAgentId];
    if (edge.relationType === 'child' && edge.targetAgentId === agentId) return [edge.sourceAgentId];
    return [];
  });
}

function lateralOf(agentId, edges, relationTypes) {
  return edges.filter((edge) => relationTypes.includes(edge.relationType)
    && (edge.sourceAgentId === agentId || edge.targetAgentId === agentId))
    .map((edge) => edge.sourceAgentId === agentId ? edge.targetAgentId : edge.sourceAgentId);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function ancestorsOf(agentId, edges) {
  const result = [];
  const seen = new Set([agentId]);
  let frontier = uniqueSorted(parentsOf(agentId, edges));
  let generation = 1;
  while (frontier.length) {
    const next = [];
    for (const ancestorId of frontier) {
      if (seen.has(ancestorId)) continue;
      seen.add(ancestorId);
      result.push({ agentId: ancestorId, generations: generation });
      next.push(...parentsOf(ancestorId, edges));
    }
    frontier = uniqueSorted(next.filter((id) => !seen.has(id)));
    generation += 1;
  }
  return result;
}

async function getKinshipProfile(input = {}) {
  const agentId = String(input.agentId || '').trim();
  if (!agentId) throw new Error('Agent ID is required.');
  const scope = requiredScope(input);
  const db = input.db || await require('../db').getDatabase();
  const edges = await loadLineage(db, scope);
  return {
    agentId,
    parents: uniqueSorted(parentsOf(agentId, edges)),
    ancestors: ancestorsOf(agentId, edges),
    siblings: uniqueSorted(lateralOf(agentId, edges, ['sibling'])),
    twins: uniqueSorted(lateralOf(agentId, edges, ['twin'])),
    children: uniqueSorted(childrenOf(agentId, edges))
  };
}

module.exports = { getKinshipProfile };
