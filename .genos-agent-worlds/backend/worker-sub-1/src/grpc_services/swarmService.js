const swarmMetrics = require('../services/swarmMetricsService');
const { getDatabase } = require('../db');
const grpc = require('@grpc/grpc-js');

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
      callback({ code: grpc.status.INTERNAL, message: `Unable to load swarm metrics: ${err.message}` });
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
      const events = await db.all(`
        SELECT id, agent_id, payload_json, created_at
        FROM telemetry_events ORDER BY created_at DESC LIMIT 100
      `);
      const topo = swarmMetrics.getSwarmTopology(agents, events);
      callback(null, {
        node_ids: (topo.nodes || []).map((n) => n.id),
        topology_json: JSON.stringify(topo)
      });
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: `Unable to load swarm topology: ${err.message}` });
    }
  }
};
