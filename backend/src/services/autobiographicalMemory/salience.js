'use strict';

// Salience scoring: turns a raw telemetry event into a weight deciding
// whether it deserves to become a durable autobiographical episode.
// salience = sum(weight_i * signal_i), signals in [0,1], weights sum to 1.

const WEIGHTS = {
  failure: 0.25,
  successWithEvidence: 0.2,
  strategyChange: 0.15,
  highCost: 0.1,
  highRisk: 0.1,
  surprise: 0.1,
  humanDecision: 0.1
};

const DEFAULT_SALIENCE_THRESHOLD = 0.3;
const HIGH_COST_TOKENS = 5000;
const HIGH_COST_LATENCY_MS = 10000;
const HIGH_RISK_THRESHOLD = 0.6;

function truthy(value) {
  return value ? 1 : 0;
}

function isFailureSignal(eventType, payload) {
  if (/FAILED|ERROR|APOPTOSIS|QUARANTINE|REJECTED|INVALID/i.test(eventType)) return true;
  return payload.status === 'failed' || payload.outcome === 'failed';
}

function isSuccessWithEvidenceSignal(eventType, payload) {
  const evidenced = Array.isArray(payload.evidence) && payload.evidence.length > 0;
  return /COMPLETED|PROMOTED|EVIDENCE_REPORT|VALIDATED/i.test(eventType) && (evidenced || payload.evidencePresent === true);
}

function isStrategyChangeSignal(eventType, payload) {
  return /STRATEGY_CHANGE|STRATEGY_FEEDBACK_LOOP_TRIGGERED|STRATEGY_PRIMITIVE_EXEC/i.test(eventType) || Boolean(payload.strategyChange);
}

function isHighCostSignal(payload) {
  const cost = payload.cost || {};
  return truthy((Number(cost.tokens) || 0) >= HIGH_COST_TOKENS || (Number(cost.latencyMs) || 0) >= HIGH_COST_LATENCY_MS);
}

function isHighRiskSignal(payload) {
  const cost = payload.cost || {};
  const risk = Number(firstFiniteRisk(payload.risk, cost.risk));
  return truthy(Number.isFinite(risk) && risk >= HIGH_RISK_THRESHOLD);
}

function firstFiniteRisk(...values) {
  for (const value of values) {
    if (Number.isFinite(Number(value))) return Number(value);
  }
  return NaN;
}

function isSurpriseSignal(payload) {
  return truthy(payload.surprise === true || payload.unexpected === true || payload.disagreement === true);
}

function isHumanDecisionSignal(eventType, payload) {
  return truthy(/HUMAN_DECISION|HUMAN_APPROVAL|HUMAN_OVERRIDE/i.test(eventType) || payload.humanDecision === true);
}

function computeSalience(event = {}) {
  const eventType = String(event.eventType || '');
  const payload = event.payload || {};
  const signals = {
    failure: truthy(isFailureSignal(eventType, payload)),
    successWithEvidence: truthy(isSuccessWithEvidenceSignal(eventType, payload)),
    strategyChange: truthy(isStrategyChangeSignal(eventType, payload)),
    highCost: isHighCostSignal(payload),
    highRisk: isHighRiskSignal(payload),
    surprise: isSurpriseSignal(payload),
    humanDecision: isHumanDecisionSignal(eventType, payload)
  };
  const salience = Object.entries(WEIGHTS).reduce((total, [key, weight]) => total + weight * signals[key], 0);
  return { salience: Math.min(1, salience), signals };
}

module.exports = { computeSalience, DEFAULT_SALIENCE_THRESHOLD, WEIGHTS };
