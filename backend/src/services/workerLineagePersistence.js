'use strict';

async function persist(db, details) {
  const { parent, assignment, id, identity, evolution } = details;
  const parentLineage = await db.get('SELECT workspace_id FROM lineage_nodes WHERE id = ?', parent.id);
  const lineageWorkspaceId = parentLineage?.workspace_id || parent.workspace_id;
  const lineage = await require('./agentEvolutionService').recordWorkerLineage(db, {
    agentId: id, workspaceId: lineageWorkspaceId, name: identity.name, role: assignment.role
  }, {
    parentId: parent.id, edgeType: 'autonomous_strategy_branch', genes: evolution?.genes,
    mutations: evolution?.mutations, predictedFitness: evolution?.predictedFitness
  });
  if (!lineage.success) throw new Error(`Worker lineage persistence failed: ${lineage.error}`);
  return lineage;
}

module.exports = { persist };
