const evolution = require('../services/agentEvolutionService');
const genetics = require('../services/geneticsService');
const { getDatabase } = require('../db');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Lineage is alive via gRPC!" }),

  GetPhylogeny: async (call, callback) => {
    try {
      const db = await getDatabase();
      const { organization_id, project_id, workspace_id } = call.request || {};
      if (!organization_id || !project_id || !workspace_id) return callback(null, { nodes_json: '[]', edges_json: '[]', node_count: 0 });
      const workspace = await db.get('SELECT id FROM workspaces WHERE id = ? AND organization_id = ? AND project_id = ?', workspace_id, organization_id, project_id);
      if (!workspace) return callback(null, { nodes_json: '[]', edges_json: '[]', node_count: 0 });
      const nodes = await db.all('SELECT * FROM lineage_nodes WHERE workspace_id = ? ORDER BY created_at LIMIT 1000', workspace_id);
      const edges = await db.all('SELECT * FROM lineage_edges WHERE workspace_id = ? ORDER BY created_at LIMIT 2000', workspace_id);
      callback(null, {
        nodes_json: JSON.stringify(nodes),
        edges_json: JSON.stringify(edges),
        node_count: nodes.length
      });
    } catch (err) {
      callback(null, { nodes_json: '[]', edges_json: '[]', node_count: 0 });
    }
  },

  RecordLineage: async (call, callback) => {
    try {
      const db = await getDatabase();
      const { agent_id, parent_id, role, score, organization_id, project_id, workspace_id } = call.request || {};
      if (!agent_id || !parent_id || !organization_id || !project_id || !workspace_id) return callback(null, { success: false });
      const child = await db.get('SELECT id FROM agents WHERE id = ? AND workspace_id = ?', agent_id, workspace_id);
      let parent = await db.get('SELECT id FROM lineage_nodes WHERE id = ? AND workspace_id = ?', parent_id, workspace_id);
      if (!parent) {
        parent = await db.get('SELECT id FROM agents WHERE id = ? AND workspace_id = ?', parent_id, workspace_id);
      }
      const workspace = await db.get('SELECT id FROM workspaces WHERE id = ? AND organization_id = ? AND project_id = ?', workspace_id, organization_id, project_id);
      if (!child || !parent || !workspace) return callback(null, { success: false });
      const result = await evolution.recordWorkerLineage(db, { agentId: agent_id, workspaceId: workspace_id, role }, { parentId: parent_id, validatedFitness: score });
      callback(null, { success: Boolean(result?.success) });
    } catch (err) {
      callback(null, { success: false });
    }
  }
};
