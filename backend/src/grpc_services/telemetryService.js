const telemetry = require('../services/telemetryObserver');
const swarmMetrics = require('../services/swarmMetricsService');
const { getDatabase } = require('../db');
const grpc = require('@grpc/grpc-js');

function parsePayloadJson(event) {
  if (!event.payload_json) return {};
  try { return JSON.parse(event.payload_json); } catch (_) { return {}; }
}

function scopedPayload(event, payload) {
  if (event.organization_id) payload.organizationId = event.organization_id;
  if (event.project_id) payload.projectId = event.project_id;
  return payload;
}

function toTelemetryInput(event) {
  const source = event || {};
  return {
    agentId: source.agent_id || 'system',
    eventType: source.event_type || 'TELEMETRY_INGEST',
    action: source.action || 'OBSERVE',
    detail: source.detail || '',
    severity: source.severity || 'info',
    status: source.status || 'active',
    payload: scopedPayload(source, parsePayloadJson(source))
  };
}

async function loadEntropyEvents(db) {
  return db.all('SELECT event_type as type, action as action FROM telemetry_events ORDER BY id DESC LIMIT 50');
}

function toMetricsResponse(metrics) {
  return { entropy: metrics.rawEntropy || 0, state: metrics.cognitiveDriftState || 'IDLE' };
}

function emitEvent(call, callback) {
  try {
    telemetry.emitEvent(toTelemetryInput(call.request));
    callback(null, { success: true });
  } catch (err) {
    callback(null, { success: false });
  }
}

async function getSwarmMetrics(call, callback) {
  try {
    const db = await getDatabase();
    const metrics = swarmMetrics.calculateShannonEntropy(await loadEntropyEvents(db));
    callback(null, toMetricsResponse(metrics));
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: `Unable to load swarm metrics: ${err.message}` });
  }
}

module.exports = {
  Ping: (call, callback) => callback(null, { status: 'Service Telemetry is alive via gRPC!' }),
  EmitEvent: emitEvent,
  GetSwarmMetrics: getSwarmMetrics
};
