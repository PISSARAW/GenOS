const telemetry = require('../services/telemetryObserver');
const swarmMetrics = require('../services/swarmMetricsService');
const { getDatabase } = require('../db');
const grpc = require('@grpc/grpc-js');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Telemetry is alive via gRPC!" }),

  EmitEvent: (call, callback) => {
    try {
      const event = call.request || {};
      let payload = {};
      if (event.payload_json) {
        payload = JSON.parse(event.payload_json);
      }
      telemetry.emitEvent({
        agentId: event.agent_id || 'system',
        eventType: event.event_type || 'TELEMETRY_INGEST',
        action: event.action || 'OBSERVE',
        detail: event.detail || '',
        severity: event.severity || 'info',
        status: event.status || 'active',
        payload
      });
      callback(null, { success: true });
    } catch (err) {
      callback(null, { success: false });
    }
  },

  GetSwarmMetrics: async (call, callback) => {
    try {
      const db = await getDatabase();
      const events = await db.all('SELECT action as type, event_type as action FROM telemetry_events ORDER BY id DESC LIMIT 50');
      const metrics = swarmMetrics.calculateShannonEntropy(events);
      callback(null, { entropy: metrics.rawEntropy || 0, state: metrics.cognitiveDriftState || 'IDLE' });
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: `Unable to load swarm metrics: ${err.message}` });
    }
  }
};
