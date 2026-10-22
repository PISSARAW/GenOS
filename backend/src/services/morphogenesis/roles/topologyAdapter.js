'use strict';

const DEFAULT_FIDELITY_THRESHOLD = 0.85;
const DEFAULT_LATENCY_BUDGET_MS = 100;

function defaultTranslate(payload, fromTopology, toTopology) {
  return { ...(payload || {}), translatedFrom: fromTopology, translatedTo: toTopology };
}

function defaultFidelity(outputs, validInputs) {
  const total = Array.isArray(outputs) ? outputs.length : 1;
  if (total === 0) return 1;
  const valid = Array.isArray(validInputs) ? validInputs.length : total;
  return Math.min(1, valid / total);
}

function defaultStateMapper(state, fromBoundary, toBoundary) {
  return { ...(state || {}), fromBoundary, toBoundary };
}

function translate(input, adapter) {
  const phi = adapter.phi_translate || defaultTranslate;
  const adapted = phi(input.payload || {}, input.fromTopology, input.toTopology);
  const fidelityFn = adapter.fidelityFn || defaultFidelity;
  const score = fidelityFn(adapted, input.payload || {});
  return {
    adapted,
    fidelity: score,
    admitted: score >= (adapter.threshold || DEFAULT_FIDELITY_THRESHOLD),
    fromTopology: input.fromTopology,
    toTopology: input.toTopology,
    latencyMs: adapter.latency
  };
}

function fidelityScore(outputs, validInputs, fidelityFn) {
  return (fidelityFn || defaultFidelity)(outputs || [], validInputs || []);
}

function meetsThreshold(score, threshold) {
  return Number(score || 0) >= threshold;
}

function mapState(input, stateMapper) {
  return (stateMapper || defaultStateMapper)(input.state || {}, input.fromBoundary, input.toBoundary);
}

function validateSemantics(adapted, inputContract) {
  const contract = inputContract || {};
  const schema = contract.schema || {};
  const missing = [];
  for (const field of Object.keys(schema)) {
    if (schema[field].required && adapted[field] === undefined) missing.push(field);
  }
  return { valid: missing.length === 0, missing };
}

function createTopologyAdapter(input = {}) {
  const phi_translate = input.phi_translate || defaultTranslate;
  const fidelityFn = input.fidelity || defaultFidelity;
  const latency = Number(input.latency || DEFAULT_LATENCY_BUDGET_MS);
  const stateMapper = input.stateMapper || defaultStateMapper;
  const threshold = Number(input.fidelityThreshold || DEFAULT_FIDELITY_THRESHOLD);
  const adapter = { phi_translate, fidelityFn, latency, stateMapper, threshold };
  return {
    phi_translate,
    fidelity: fidelityFn,
    latency,
    stateMapper,
    threshold,
    translate: (input) => translate(input, adapter),
    fidelityScore: (outputs, validInputs) => fidelityScore(outputs, validInputs, adapter.fidelityFn),
    meetsThreshold: (score) => meetsThreshold(score, adapter.threshold),
    mapState: (state, fromBoundary, toBoundary) => mapState({ state, fromBoundary, toBoundary }, adapter.stateMapper),
    validateSemantics
  };
}

module.exports = { createTopologyAdapter, DEFAULT_FIDELITY_THRESHOLD, DEFAULT_LATENCY_BUDGET_MS };
