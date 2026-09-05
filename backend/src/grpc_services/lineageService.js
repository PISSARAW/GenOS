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
      const { agent_id, parent_id, role, score } = call.request || {};
      await evolution.recordWorkerLineage(db, { agentId: agent_id, role }, { parentId: parent_id, predictedFitness: score });
      callback(null, { success: true });
    } catch (err) {
      callback(null, { success: false });
    }
  }
};
