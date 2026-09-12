const swarmMetrics = require('../services/swarmMetricsService');
const { getDatabase } = require('../db');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Swarm is alive via gRPC!" }),

  GetSwarmMetrics: async (call, callback) => {
    try {
      const db = await getDatabase();
      const metricEvents = await db.all('SELECT action as type, event_type as action, agent_id FROM telemetry_events ORDER BY id DESC LIMIT 50');
      const metrics = swarmMetrics.calculateShannonEntropy(metricEvents);
      callback(null, {
        entropy: metrics.rawEntropy != null ? metrics.rawEntropy : (metrics.entropy || 0),
        normalized_entropy: metrics.normalizedEntropy || 0,
        state: metrics.cognitiveDriftState || metrics.state || 'IDLE',
        agent_count: metrics.uniqueActions || 0
      });
    } catch (err) {
      callback(null, { entropy: 0, normalized_entropy: 0, state: 'ERROR', agent_count: 0 });
    }
  },

  GetSwarmTopology: async (call, callback) => {
    try {
      const db = await getDatabase();
      const agents = await db.all(`
        SELECT id, name, role, status, model_tier as tier, workspace_id as workspaceId,
          fleet_id as fleetId, parent_agent_id as parentAgentId
        FROM agents WHERE status != 'terminated'
      `);
      const events = await db.all('SELECT id, agent_id, payload_json, created_at FROM telemetry_events ORDER BY created_at DESC LIMIT 100');
      const topo = swarmMetrics.getSwarmTopology(agents, events);
      callback(null, {
        node_ids: (topo.nodes || []).map((n) => n.id),
        topology_json: JSON.stringify(topo)
      });
    } catch (err) {
      callback(null, { node_ids: [], topology_json: '{}' });
    }
  }
};
