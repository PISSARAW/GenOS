'use strict';
const { digest } = require('./biologicalIntegrity');
const { biologyError } = require('./biologicalWorkerStore');

function finiteMeasurement(value) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) throw biologyError('BIOLOGICAL_WORKER_COST_INVALID');
  return value;
}

function measuredTokens(payload, usage) {
  const total = payload.tokens ?? usage.total_tokens ?? usage.tokens;
  if (total !== undefined) return finiteMeasurement(total);
  const input = usage.input_tokens ?? usage.prompt_tokens;
  const output = usage.output_tokens ?? usage.completion_tokens;
  if (input === undefined || output === undefined) return null;
  return finiteMeasurement(input) + finiteMeasurement(output);
}

function usageMeasurements(event) {
  const payload = event.payload || {};
  const usage = payload.usage || payload.item?.usage || {};
  return { tokens: measuredTokens(payload, usage),
    usd: finiteMeasurement(payload.costUsd ?? payload.cost_usd ?? usage.cost_usd) };
}

function summed(observations, field) {
  const values = observations.map(item => usageMeasurements(item.event)[field]).filter(value => value !== null);
  if (!values.length) return null;
  return Number(values.reduce((total, value) => total + value, 0).toFixed(9));
}

function register(name, unit, quantity) {
  return { register: name, unit, quantity, measurement: quantity === null ? 'unavailable' : 'observed',
    source: unit === 'USD' ? 'provider_cost_telemetry' : 'runtime_telemetry' };
}

function costs(observations, run) {
  return [register('worker_llm_tokens', 'token', summed(observations, 'tokens')),
    register('worker_provider_billing', 'USD', summed(observations, 'usd')),
    register('worker_runtime', 'millisecond', finiteMeasurement(run.metrics?.latencyMs ?? null))];
}

function terminalObservation(observations) {
  const { FINAL_EVENTS } = require('./strategyExecutionEvents');
  return observations.filter(item => FINAL_EVENTS.has(item.event.eventType)).at(-1) || null;
}

function evidenceSnapshot(observations) {
  const terminal = terminalObservation(observations);
  const payload = terminal?.event.payload || {};
  const report = payload.evidenceReport || payload.report || null;
  const proof = payload.noAnswerProof || null;
  return { report, noAnswerProof: proof, terminalEvent: terminal?.event.eventType || null,
    observations: observations.map(item => item.hash), hash: digest({ report, proof }) };
}

function hasResultEvidence(evidence) {
  if (evidence.noAnswerProof?.proven === true) return true;
  const claims = evidence.report?.claims;
  return Array.isArray(claims) && claims.length > 0
    && claims.every(claim => Array.isArray(claim.evidence) && claim.evidence.length > 0);
}

function budgetAssessment(receipt, binding) {
  const limits = { token: binding.budget.tokens, USD: binding.budget.costUsd, millisecond: binding.budget.latencyMs };
  const missing = receipt.costs.filter(item => item.quantity === null).map(item => item.register);
  const exceeded = receipt.costs.filter(item => item.quantity !== null && item.quantity > limits[item.unit]).map(item => item.register);
  return { satisfied: missing.length === 0 && exceeded.length === 0 && receipt.accounting.consistent, missing, exceeded };
}

function accounting(observations, run) {
  const tokens = summed(observations, 'tokens');
  const usd = summed(observations, 'usd');
  const metrics = run.metrics || {};
  const tokenMatch = tokens === null || tokens === metrics.tokens;
  const usdMatch = usd === null || Math.abs(usd - metrics.costUsd) <= 0.000001;
  return { consistent: tokenMatch && usdMatch && observations.length === metrics.events,
    observedEvents: observations.length, recordedEvents: metrics.events, tokenMatch, usdMatch };
}

module.exports = { usageMeasurements, costs, terminalObservation, evidenceSnapshot, hasResultEvidence, budgetAssessment, accounting };
