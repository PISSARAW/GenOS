'use strict';

const { buildInteroceptiveState } = require('../gvxInteroception');
const { appendEvent } = require('../gvxDevelopmentLedger');

async function sampleCanonicalInteroception(input) {
  const sample = input.sample || await require('../machineInteroceptionService').senseAgentRuntime(
    input.db, input.agentId, { now: input.now });
  return buildInteroceptiveState({
    scope: input.scope, now: sample.sampledAt,
    freshnessPolicy: { now: sample.sampledAt, observedAt: sample.sampledAt },
    measurements: canonicalMeasurements(sample)
  });
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
    securityAnomalies: unknown('no dedicated security sensor'),
    calibrationError: unknown('no calibrated prediction sensor'),
    coordinationLoad: unknown('no measured coordination-load sensor')
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

module.exports = { sampleCanonicalInteroception, recordCanonicalInteroception, canonicalMeasurements, deriveAgowPosture };
