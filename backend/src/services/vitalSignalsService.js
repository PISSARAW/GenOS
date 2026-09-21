'use strict';

const crypto = require('crypto');
const telemetry = require('./telemetryObserver');

const CELL_STATES = Object.freeze([
  'active',
  'quiescent',
  'stressed',
  'starved',
  'injured',
  'unresponsive',
  'dead'
]);

const VITAL_SIGNAL_KIND = Object.freeze({
  CELL_PULSE: 'CELL_PULSE',
  VITAL_TELEMETRY: 'VITAL_TELEMETRY',
  STRESS_SIGNAL: 'STRESS_SIGNAL',
  CELL_LOSS: 'CELL_LOSS',
  CELL_DEATH: 'CELL_DEATH',
  TISSUE_REGENERATION: 'TISSUE_REGENERATION',
  HOMEOSTASIS_DEVIATION: 'HOMEOSTASIS_DEVIATION'
});

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

function pulseId(cellId, missionId) {
  return `pulse_${cellId}_${missionId}_${crypto.randomUUID()}`;
}

function buildPulse(input = {}) {
  const cell = String(input.cell || 'unknown');
  const mission = String(input.mission || 'unknown');
  return {
    id: input.id || pulseId(cell, mission),
    cell,
    mission,
    state: String(input.state || 'active'),
    progressSignal: clamp01(input.progressSignal),
    metabolicLoad: {
      tokens: Number(input.tokens || 0),
      cost: Number(input.cost || 0)
    },
    stress: clamp01(input.stress, input.stress === 0 ? 0 : 0),
    lastEvidence: input.lastEvidence || null,
    at: input.at || new Date().toISOString()
  };
}

function interpretCellState(pulse, leaseTimeoutMs, minimumRequiredBudget) {
  const age = Date.now() - (new Date(pulse.at).getTime());
  if (pulse.state === 'dead') return 'dead';
  if (age > leaseTimeoutMs) return 'unresponsive';
  if (pulse.metabolicLoad.tokens > 0 && pulse.metabolicLoad.tokens < minimumRequiredBudget) return 'starved';
  if (pulse.stress >= 0.75) return 'stressed';
  if (pulse.state === 'injured') return 'injured';
  if (pulse.state === 'quiescent' || pulse.state === 'idle') return 'quiescent';
  return pulse.state === 'active' ? 'active' : 'unresponsive';
}

function stressLevel(input = {}) {
  const recentFailures = Number(input.recentFailures || 0);
  const contextSaturation = clamp01(input.contextSaturation);
  const uncertainty = clamp01(input.uncertainty);
  const budgetPressure = clamp01(input.budgetPressure);
  const epistemicDissonance = clamp01(input.epistemicDissonance);
  const weights = {
    failure: Number(input.weights?.failure ?? 0.30),
    context: Number(input.weights?.context ?? 0.20),
    uncertainty: Number(input.weights?.uncertainty ?? 0.15),
    budget: Number(input.weights?.budget ?? 0.20),
    dissonance: Number(input.weights?.dissonance ?? 0.15)
  };
  const total = weights.failure + weights.context + weights.uncertainty + weights.budget + weights.dissonance;
  const normalized = total > 0
    ? (weights.failure + weights.context + weights.uncertainty + weights.budget + weights.dissonance) / total
    : 1;
  return Math.min(1, (recentFailures * 0.1 + contextSaturation * 0.25 + uncertainty * 0.2 + budgetPressure * 0.25 + epistemicDissonance * 0.2) * (1 / normalized));
}

function boundWeights(input = {}) {
  const weights = input.weights || {};
  const w = {
    failure: Number(weights.failure ?? 0.30),
    context: Number(weights.context ?? 0.20),
    uncertainty: Number(weights.uncertainty ?? 0.15),
    budget: Number(weights.budget ?? 0.20),
    dissonance: Number(weights.dissonance ?? 0.15)
  };
  const total = w.failure + w.context + w.uncertainty + w.budget + w.dissonance;
  const normalization = total > 0 ? 1 / total : 1;
  return { w, normalization };
}

function allostaticLoad(input = {}) {
  const { F, C, U, B, D } = boundedFactors(input);
  const { w, normalization } = boundWeights(input);
  return Math.min(1, (w.failure * F + w.context * C + w.uncertainty * U + w.budget * B + w.dissonance * D) * normalization);
}

function allostaticThreshold(input = {}) {
  return clamp01(input?.threshold ?? 0.65);
}

function allostaticWarning(input = {}) {
  const load = allostaticLoad(input);
  const threshold = allostaticThreshold(input);
  return {
    load,
    threshold,
    warning: load >= threshold,
    adaptabilitySuggested: load >= threshold * 0.8,
    checkpointSuggested: load >= threshold * 0.9,
    successorSuggested: load >= threshold
  };
}

function emitVitalEvent(eventType, payload, severity = 'info') {
  telemetry.emitEvent({
    eventType,
    agentId: payload.cell || payload.mission || 'system',
    action: eventType.toLowerCase(),
    detail: `Vital signal: ${eventType}`,
    payload,
    sessionId: payload.mission || 'vital',
    severity
  });
}

function emitCellPulse(input = {}) {
  const pulse = buildPulse(input);
  emitVitalEvent(VITAL_SIGNAL_KIND.CELL_PULSE, { pulse }, 'info');
  return pulse;
}

function emitCellLoss(input = {}) {
  const event = {
    cell: input.cell,
    mission: input.mission,
    role: input.role || null,
    reason: input.reason || 'unresponsive',
    at: new Date().toISOString()
  };
  emitVitalEvent(VITAL_SIGNAL_KIND.CELL_LOSS, event, 'warning');
  return event;
}

function emitCellDeath(input = {}) {
  const event = {
    cell: input.cell,
    mission: input.mission,
    role: input.role || null,
    reason: input.reason || 'unresponsive',
    acknowledged: input.acknowledged !== false,
    organismId: input.organismId || null,
    at: new Date().toISOString()
  };
  emitVitalEvent(VITAL_SIGNAL_KIND.CELL_DEATH, event, 'warning');
  return event;
}

function emitTissueRegeneration(input = {}) {
  const event = {
    tissue: input.tissue || 'unknown',
    mission: input.mission,
    lostRole: input.lostRole || null,
    replacementId: input.replacementId || null,
    method: input.method || 'regeneration',
    at: new Date().toISOString()
  };
  emitVitalEvent(VITAL_SIGNAL_KIND.TISSUE_REGENERATION, event, 'info');
  return event;
}

function emitHomeostasisDeviation(input = {}) {
  const event = {
    mission: input.mission,
    organismId: input.organismId || null,
    deviation: input.deviation || null,
    severity: input.deviationSeverity || 'info',
    at: new Date().toISOString()
  };
  emitVitalEvent(VITAL_SIGNAL_KIND.HOMEOSTASIS_DEVIATION, event, severity);
  return event;
}

function tissueHealth(tissue, leaseTimeoutMs, minimumRequiredBudget) {
  if (!Array.isArray(tissue)) return { state: 'unknown', cells: 0, healthy: 0, degraded: 0 };
  const cells = tissue.length;
  let healthy = 0;
  let degraded = 0;
  for (const cell of tissue) {
    const interpretation = interpretCellState(cell, leaseTimeoutMs, minimumRequiredBudget);
    if (['active', 'quiescent'].includes(interpretation)) healthy += 1;
    else if (interpretation === 'dead') degraded += 1;
    else degraded += 1;
  }
  const state = cells > 0
    ? healthy >= cells ? 'healthy'
    : healthy >= cells / 2 ? 'degraded'
    : 'unhealthy'
    : 'unknown';
  return { state, cells, healthy, degraded };
}

module.exports = {
  CELL_STATES,
  VITAL_SIGNAL_KIND,
  buildPulse,
  interpretCellState,
  stressLevel,
  allostaticLoad,
  allostaticThreshold,
  allostaticWarning,
  emitCellPulse,
  emitCellLoss,
  emitCellDeath,
  emitTissueRegeneration,
  emitHomeostasisDeviation,
  tissueHealth,
  pulseId
};