const swarmMetrics = require('../services/swarmMetricsService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Swarm is alive via gRPC!" }),

  GetSwarmMetrics: (call, callback) => {
    try {
      const metrics = swarmMetrics.getSwarmMetrics();
      callback(null, {
        entropy: metrics.entropy || 0,
        normalized_entropy: metrics.normalizedEntropy || 0,
        state: metrics.state || 'IDLE',
        agent_count: metrics.agentCount || 0
      });
    } catch (err) {
      callback(null, { entropy: 0, normalized_entropy: 0, state: 'ERROR', agent_count: 0 });
    }
  },

  GetSwarmTopology: (call, callback) => {
    try {
      const topo = swarmMetrics.buildSwarmTopology();
      callback(null, {
        node_ids: (topo.nodes || []).map((n) => n.id),
        topology_json: JSON.stringify(topo)
      });
    } catch (err) {
      callback(null, { node_ids: [], topology_json: '{}' });
    }
  }
};
