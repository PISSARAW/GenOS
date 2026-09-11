const evolution = require('../services/agentEvolutionService');
const genetics = require('../services/geneticsService');
const { getDatabase } = require('../db');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Lineage is alive via gRPC!" }),

  GetPhylogeny: async (call, callback) => {
    try {
      const db = await getDatabase();
      const nodes = await db.all('SELECT * FROM lineage_nodes LIMIT 100');
      const edges = await db.all('SELECT * FROM lineage_edges LIMIT 100');
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
      if (!agent_id || !parent_id) return callback(null, { success: false });
      let wsId = workspace_id;
      if (!wsId) {
        const agent = await db.get('SELECT workspace_id FROM agents WHERE id = ?', agent_id);
        wsId = agent?.workspace_id;
      }
      if (!wsId) return callback(null, { success: false });
      const result = await evolution.recordWorkerLineage(db, { agentId: agent_id, workspaceId: wsId, role }, { parentId: parent_id, validatedFitness: score });
      callback(null, { success: !!result?.success });
    } catch (err) {
      callback(null, { success: false });
    }
  }
};
