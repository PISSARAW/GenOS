'use strict';

const agentEvolution = require('../agentEvolutionService');

async function ensureLineageNode(db, source, nodeId) {
  await db.run(
    `INSERT INTO lineage_nodes (id, workspace_id, agent_id, label, node_type, state_summary)
     VALUES (?, ?, ?, ?, 'agent', ?)
     ON CONFLICT(id) DO NOTHING`,
    nodeId, source.workspace_id, nodeId, source.name || nodeId,
    `Recovery source: ${source.role || 'worker'}`
  );
}

async function recordRecoveryLineage(db, source, target) {
  const workspaceId = target.workspaceId || source.workspace_id;
  const lineage = await agentEvolution.recordWorkerLineage(db, {
    agentId: target.targetId,
    name: target.name,
    role: target.role,
    workspaceId
  }, {
    // Keep runtime lineage inside the garage domain; retain the failed worker
    // as provenance without creating a cross-workspace edge.
    parentId: target.orchestratorId,
    parents: { recoverySource: target.sourceAgentId },
    edgeType: 'recovery'
  });
  if (!lineage?.success) {
    throw Object.assign(new Error(lineage?.error || 'Failed to persist recovery worker lineage.'), {
      code: 'LINEAGE_PERSISTENCE_FAILED'
    });
  }
  if (target.sourceAgentId && target.sourceAgentId !== target.targetId
    && source.workspace_id === workspaceId) {
    await ensureLineageNode(db, source, target.sourceAgentId);
    await db.run(
      `INSERT INTO lineage_edges (id, workspace_id, source_node_id, target_node_id, edge_type)
       VALUES (?, ?, ?, ?, 'recovery_transition')
       ON CONFLICT(id) DO NOTHING`,
      `edge_recovery_${target.sourceAgentId}_${target.targetId}`,
      workspaceId,
      target.sourceAgentId,
      target.targetId
    );
  }
}

module.exports = { recordRecoveryLineage };
