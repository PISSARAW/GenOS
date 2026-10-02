'use strict';

const { buildInteroceptiveState } = require('../gvxInteroception');
const { appendEvent } = require('../gvxDevelopmentLedger');

async function sampleCanonicalInteroception(input) {
  const sample = input.sample || await require('../machineInteroceptionService').senseAgentRuntime(
    input.db, input.agentId, { now: input.now });
  const gvx = await sampleGvxSensors(input);
  return buildInteroceptiveState({
    scope: input.scope, now: sample.sampledAt,
    freshnessPolicy: { now: sample.sampledAt, observedAt: sample.sampledAt },
    measurements: { ...canonicalMeasurements(sample), ...gvx }
  });
}

async function sampleGvxSensors(input) {
  if (!input.db || !input.scope?.organizationId || !input.scope?.projectId) return {};
  const sampledAt = input.sample?.sampledAt || new Date(input.now || Date.now()).toISOString();
  const since = new Date(Date.parse(sampledAt) - 30 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const [security, coordination, events] = await Promise.all([
    telemetryCounts({ db: input.db, agentId: input.agentId, since, kind: 'security' }),
    telemetryCounts({ db: input.db, agentId: input.agentId, since, kind: 'coordination' }),
    require('../gvxDevelopmentLedger').listEvents(input.db, {
      ...input.scope, entityId: input.agentId, limit: 2000
    })
  ]);
  return {
    securityAnomalies: ratioMeasurement({ numerator: security?.anomalies, denominator: security?.total,
      source: 'telemetry_events.security_event_rate', measuredAt: sampledAt }),
    calibrationError: calibrationMeasurement(events, sampledAt),
    coordinationLoad: ratioMeasurement({ numerator: coordination?.coordinated, denominator: coordination?.total,
      source: 'telemetry_events.coordination_event_rate', measuredAt: sampledAt })
  };
}

async function telemetryCounts(input) {
  try {
    const table = await input.db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'telemetry_events'");
    if (!table) return null;
    const fields = input.kind === 'security'
      ? `SUM(CASE WHEN event_type IN ('HALLUCINATION_DETECTED','SWARM_ENTROPY_COLLAPSE',
          'SWARM_INTERACTION_DEADLOCK','STRATEGY_GUARDRAIL_BLOCKED','AGENT_RUNTIME_ERROR') THEN 1 ELSE 0 END) AS measured`
      : `SUM(CASE WHEN event_type IN ('GLOBAL_WORKSPACE_CONSUMPTION','WORKER_REGISTERED',
          'AGENT_DISPATCHED','AGENT_STEP') THEN 1 ELSE 0 END) AS measured`;
    const row = await input.db.get(`SELECT COUNT(*) AS total, ${fields}
      FROM telemetry_events WHERE agent_id = ? AND created_at >= ?`, input.agentId, input.since);
    return input.kind === 'security' ? { total: row?.total, anomalies: row?.measured }
      : { total: row?.total, coordinated: row?.measured };
  } catch (_) { return null; }
}

function ratioMeasurement(input) {
  const { numerator, denominator, source, measuredAt } = input;
  if (!Number.isFinite(Number(numerator)) || !Number.isFinite(Number(denominator)) || Number(denominator) === 0) {
    return unknown(`${source} unavailable`);
  }
  return { value: Math.max(0, Math.min(1, Number(numerator) / Number(denominator))), source, measuredAt };
}

function calibrationMeasurement(events, measuredAt) {
  const minimumTime = Date.parse(measuredAt) - 30 * 60 * 1000;
  const values = events.filter((event) => event.payload?.kind === 'self_twin_discrepancy'
    && Number.isFinite(event.payload.discrepancy?.epsilon)
    && Date.parse(event.createdAt) >= minimumTime)
    .slice(-100).map((event) => event.payload.discrepancy.epsilon);
  if (!values.length) return unknown('gvxDevelopmentLedger.self_twin_discrepancy unavailable');
  return { value: values.reduce((sum, value) => sum + value, 0) / values.length,
    source: 'gvxDevelopmentLedger.self_twin_discrepancy.epsilon', measuredAt };
}

async function recordCanonicalInteroception(input) {
  const state = await sampleCanonicalInteroception(input);
  await appendEvent(input.db, {
    id: `machine-interoception:${state.snapshotId}`, ...input.scope, entityId: input.agentId,
    type: 'evidence_attached', payload: { kind: 'canonical_interoception', sourceSystem: 'machineInteroceptionService',
      sampledAt: input.sample?.sampledAt || state.createdAt, dimensions: state.dimensions }
  });
  return state;
}

function canonicalMeasurements(sample) {
  const variables = sample.variables;
  return {
    memoryPressure: measured(variables.memory_pressure, 'machineInteroception.memory_pressure', sample.sampledAt),
    budgetRatio: measured(1 - variables.energy, 'machineInteroception.energy', sample.sampledAt),
    errorRate: measured(variables.model_drift, 'machineInteroception.model_drift', sample.sampledAt),
    evidenceIntegrity: measured(variables.integrity, 'machineInteroception.integrity', sample.sampledAt),
    securityAnomalies: unknown('security sensor not sampled'),
    calibrationError: unknown('calibration sensor not sampled'),
    coordinationLoad: unknown('coordination sensor not sampled')
  };
}

function measured(value, source, measuredAt) {
  return Number.isFinite(value) ? { value, source, measuredAt } : unknown(`${source} unavailable`);
}

function unknown(source) { return { value: null, source }; }

function deriveAgowPosture(state) {
  const dimensions = state.dimensions;
  return {
    reduceAttention: high(dimensions.memoryPressure) || high(dimensions.budgetRatio),
    reduceFanout: high(dimensions.coordinationLoad),
    increaseVerification: low(dimensions.evidenceIntegrity) || high(dimensions.errorRate),
    status: Object.values(dimensions).every((item) => item.status === 'measured') ? 'measured' : 'partial'
  };
}

function high(measurement) { return measurement.status === 'measured' && measurement.value >= 0.75; }
function low(measurement) { return measurement.status === 'measured' && measurement.value <= 0.25; }

module.exports = { sampleCanonicalInteroception, recordCanonicalInteroception, canonicalMeasurements,
  sampleGvxSensors, calibrationMeasurement, ratioMeasurement, deriveAgowPosture };
