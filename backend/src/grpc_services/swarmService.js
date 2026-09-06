const swarmMetrics = require('../services/swarmMetricsService');
const { getDatabase } = require('../db');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Swarm is alive via gRPC!" }),

  GetSwarmMetrics: async (call, callback) => {
    try {
      const db = await getDatabase();
      const events = await db.all('SELECT action as type, event_type as action, agent_id FROM telemetry_events ORDER BY id DESC LIMIT 50');
      const metrics = swarmMetrics.calculateShannonEntropy(events);
      const activeCount = await db.get("SELECT COUNT(*) as count FROM agents WHERE status = 'running'");
      callback(null, {
        entropy: metrics.rawEntropy || 0,
        normalized_entropy: metrics.normalizedEntropy || 0,
        state: metrics.cognitiveDriftState || 'IDLE',
        agent_count: activeCount?.count || 0
      });
    } catch (err) {
      callback(null, { entropy: 0, normalized_entropy: 0, state: 'IDLE', agent_count: 0 });
    }
  },

  GetSwarmTopology: async (call, callback) => {
    try {
      const db = await getDatabase();
      const topo = await swarmMetrics.getSwarmTopology(db);
      callback(null, {
        node_ids: (topo.nodes || []).map((n) => n.id),
        topology_json: JSON.stringify(topo)
      });
    } catch (err) {
      callback(null, { node_ids: [], topology_json: '{}' });
    }
  }
};
