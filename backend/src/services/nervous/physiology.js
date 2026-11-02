'use strict';

const FRESH_MS = 30000;
const PRIME_MS = 300000;
const REFRACTORY_MS = 5000;

function initial() {
  return { mode: 'UNKNOWN', pressure: null, pressureAt: null, coverage: null,
    coverageAt: null, lastObservedAt: null, healthySamples: 0, priming: 0,
    primedAt: null, lastThreatAt: null, lastAttentionAt: null, lastKind: null, repetitions: 0 };
}

function threat(signal) {
  if (signal.severity === 'critical') return true;
  if (signal.channel === 'nociception') return true;
  if (signal.kind === 'TOKEN_ROUND_FAILED') return true;
  return signal.reportedOutcome === 'failure';
}

function pressureSample(signal) {
  if (signal.pressure !== null) return signal.pressure;
  if (signal.kind === 'TOKEN_ROUND_FAILED') return 1;
  return null;
}

function decayPriming(state, now) {
  if (state.primedAt === null) return 0;
  return state.priming * Math.max(0, 1 - Math.max(0, now - state.primedAt) / PRIME_MS);
}

function sampleState(state, signal) {
  const value = pressureSample(signal);
  if (value !== null) {
    state.pressure = value;
    state.pressureAt = signal.observedAt;
  }
  if (signal.coverage !== null) {
    state.coverage = signal.coverage;
    state.coverageAt = signal.observedAt;
  }
  return value;
}

function regulate(state, signal, value) {
  const threshold = 0.8 - state.priming;
  if (threat(signal) || (value !== null && value >= threshold)) {
    state.mode = 'ALERT';
    state.lastThreatAt = signal.observedAt;
    state.healthySamples = 0;
    return;
  }
  if (value === null) return;
  if (value > 0.4) { state.healthySamples = 0; return; }
  state.healthySamples += 1;
  if (state.mode === 'ALERT') state.mode = 'RECOVERY';
  if (state.healthySamples >= 3) state.mode = 'REST';
}

function reflexes(state, signal, urgent) {
  if (urgent) {
    const action = signal.channel === 'epistemic' ? 'REQUEST_VERIFICATION' : 'INHIBIT_DISPATCH';
    return [action, 'NOTIFY_OPERATOR'];
  }
  if (state.coverage !== null && state.coverage < 0.8) return ['INCREASE_MONITORING'];
  return [];
}

function isHistorical(state, signal, now) {
  if (now - signal.observedAt > FRESH_MS) return true;
  return state.lastObservedAt !== null && signal.observedAt < state.lastObservedAt;
}

function fresh(at, now) { return at !== null && now - at <= FRESH_MS; }

function expireState(state, now) {
  if (!fresh(state.coverageAt, now)) { state.coverage = null; state.coverageAt = null; }
  if (!fresh(state.pressureAt, now)) {
    state.pressure = null;
    state.pressureAt = null;
    state.healthySamples = 0;
    if (!fresh(state.lastThreatAt, now)) state.mode = 'UNKNOWN';
  }
}

function updateResponse(state, signal, now) {
  expireState(state, now);
  state.priming = decayPriming(state, now);
  state.primedAt = now;
  if (threat(signal)) state.priming = Math.min(0.2, state.priming + 0.05);
  const value = sampleState(state, signal);
  regulate(state, signal, value);
  return threat(signal) || (value !== null && value >= 0.8 - state.priming);
}

function advance(previous, signal, now) {
  const state = { ...(previous || initial()) };
  if (isHistorical(state, signal, now)) return { state, actions: [], disposition: 'HISTORICAL' };
  const urgent = updateResponse(state, signal, now);
  state.repetitions = state.lastKind === signal.kind ? state.repetitions + 1 : 1;
  const refractory = state.lastAttentionAt !== null && now - state.lastAttentionAt < REFRACTORY_MS;
  const actions = reflexes(state, signal, urgent);
  const inhibited = !urgent && refractory;
  if (!inhibited && actions.length) state.lastAttentionAt = now;
  state.lastKind = signal.kind;
  state.lastObservedAt = signal.observedAt;
  return { state, actions: inhibited ? [] : actions,
    disposition: inhibited ? 'HABITUATED' : 'OBSERVED', urgent };
}

function view(state, now) {
  const value = state || initial();
  const pressureFresh = fresh(value.pressureAt, now);
  const coverageFresh = fresh(value.coverageAt, now);
  const threatFresh = fresh(value.lastThreatAt, now);
  const coverage = coverageFresh ? value.coverage : null;
  return { ...value, pressure: pressureFresh ? value.pressure : null, coverage,
    observability: coverage === null ? 'UNKNOWN' : 'MEASURED',
    uncertainty: coverage === null ? 1 : 1 - coverage,
    mode: pressureFresh || threatFresh ? value.mode : 'UNKNOWN', priming: decayPriming(value, now) };
}

module.exports = { FRESH_MS, PRIME_MS, REFRACTORY_MS, initial, threat, advance, view };
