'use strict';

const crypto = require('crypto');
const immuneThreats = require('./immuneThreats');
const immuneJson = require('./immuneJson');
const { isFunctionCovered } = require('./missionOrganismService');

const ANOMALY_LEVELS = Object.freeze({
  NONE: 'none',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
});

function anomalyLevelFromScore(score) {
  if (score <= 0.2) return ANOMALY_LEVELS.NONE;
  if (score < 0.5) return ANOMALY_LEVELS.LOW;
  if (score < 0.75) return ANOMALY_LEVELS.MEDIUM;
  return ANOMALY_LEVELS.HIGH;
}

function threatScan(target) {
  if (!target) return { threats: [] };
  const result = immuneThreats.scanThreats(target);
  return {
    threats: result.threats,
    threatCount: result.threats.length,
    hasThreats: result.threats.length > 0
  };
}

function evidenceGate(kind, predicate, weight) {
  return {
    kind: String(kind || 'generic'),
    predicate: predicate || null,
    weight: Number.isFinite(weight) ? weight : 1,
    enabled: true,
    lastEvaluatedAt: null,
    passed: null
  };
}

function evidenceGatesFromConfig(config = []) {
  return (Array.isArray(config) ? config : []).map((entry) => {
    if (typeof entry === 'string') return evidenceGate(entry, null, 1);
    return evidenceGate(entry.kind, entry.predicate, entry.weight);
  });
}

function evaluateEvidenceGate(gate, context) {
  if (!gate.enabled || !gate.predicate) return { gate, passed: true, score: gate.weight };
  let passed = false;
  let score = 0;
  try {
    const result = gate.predicate(context);
    passed = !!result;
    score = gate.weight * (passed ? 1 : 0);
  } catch (error) {
    passed = false;
    score = 0;
  }
  gate.passed = passed;
  gate.lastEvaluatedAt = new Date().toISOString();
  return { gate, passed, score };
}

function evaluateEvidenceGates(gates, context) {
  const results = gates.map((gate) => evaluateEvidenceGate(gate, context));
  const totalWeight = results.reduce((sum, r) => sum + r.gate.weight, 0) || 1;
  const weightedScore = results.reduce((sum, r) => sum + r.score, 0) / totalWeight;
  return {
    gates: results,
    totalWeight,
    weightedScore,
    allPassed: results.every((r) => r.passed),
    score: anomalyLevelFromScore(1 - weightedScore)
  };
}

function anomalyDetectionConfig() {
  return {
    threatScan: true,
    evidenceGates: [],
    failureRateThreshold: 0.5,
    repeatedFailureCount: 2,
    quarantineThreshold: ANOMALY_LEVELS.MEDIUM
  };
}

function anomalySeverityScore(threatResult, gateEval, config) {
  let score = 0;
  if (threatResult.hasThreats) score += 0.5;
  if (gateEval.failedGateCount > 0) score += 0.3 * gateEval.failedGateCount;
  if (gateEval.repeatedFailures >= config.repeatedFailureCount) score += 0.2;
  return score;
}

function shouldQuarantine(anomalyLevel, config) {
  if (anomalyLevel === ANOMALY_LEVELS.HIGH) return true;
  if (anomalyLevel === ANOMALY_LEVELS.MEDIUM && config.quarantineThreshold === ANOMALY_LEVELS.MEDIUM) return true;
  return false;
}

function evaluateAnomaly(input = {}) {
  const config = Object.assign({}, anomalyDetectionConfig(), input.config);
  const context = input.context || {};
  const threatResult = config.threatScan ? threatScan(input.target || context.target || '') : { threats: [] };
  const gates = evidenceGatesFromConfig(config.evidenceGates);
  const evidenceResult = evaluateEvidenceGates(gates, context);
  const failedGateCount = gates.filter((g) => g.enabled && !g.passed).length;
  const repeatedFailures = Number(context.recentFailures) || 0;
  const gateEval = { failedGateCount, repeatedFailures };
  const severityScore = anomalySeverityScore(threatResult, gateEval, config);
  const anomalyLevel = anomalyLevelFromScore(severityScore);
  const quarantine = shouldQuarantine(anomalyLevel, config);
  return {
    threatResult,
    evidenceResult,
    failedGateCount,
    repeatedFailures,
    severityScore,
    anomalyLevel,
    quarantine,
    recommendedAction: quarantine ? 'quarantine' : (anomalyLevel === ANOMALY_LEVELS.MEDIUM ? 'investigate' : 'continue')
  };
}

function quarantineDecision(input = {}) {
  const evaluation = evaluateAnomaly(input);
  return {
    quarantine: evaluation.quarantine,
    reason: evaluation.quarantine ? `Anomaly level ${evaluation.anomalyLevel} exceeds quarantine threshold` : null,
    level: evaluation.anomalyLevel,
    gates: evaluation.evidenceResult.gates,
    threats: evaluation.threatResult.threats
  };
}

function buildTissueEvidenceContext(organism, missionContext = {}) {
  const tissueCoverage = {};
  for (const kind of Object.keys(organism.tissues || {})) {
    const tissue = organism.tissues[kind];
    if (Array.isArray(tissue)) {
      tissueCoverage[kind] = tissue.filter((cell) => cell.status === 'alive').length;
    }
  }
  return {
    ...missionContext,
    tissueCoverage,
    functionCovered: (requiredRoles) => isFunctionCovered(organism, requiredRoles),
    organismId: organism.id,
    timestamp: new Date().toISOString()
  };
}

function isSafeToProceed(input = {}) {
  const evaluation = evaluateAnomaly(input);
  const organism = input.organism || null;
  const requiredRoles = (input.requiredRoles || []).slice();
  const context = buildTissueEvidenceContext(organism, input.context || {});
  const functionOk = requiredRoles.length === 0 || context.functionCovered(requiredRoles);
  return {
    safe: evaluation.quarantine === false && evaluation.anomalyLevel !== ANOMALY_LEVELS.HIGH && functionOk,
    reason: functionOk === false
      ? 'Required tissue function not covered'
      : evaluation.quarantine
        ? `Quarantine recommended: anomaly level ${evaluation.anomalyLevel}`
        : (evaluation.anomalyLevel === ANOMALY_LEVELS.HIGH
          ? 'High anomaly level detected'
          : 'ok'),
    anomaly: evaluation,
    functionCovered: functionOk
  };
}

module.exports = {
  ANOMALY_LEVELS,
  anomalyLevelFromScore,
  threatScan,
  evidenceGate,
  evidenceGatesFromConfig,
  evaluateEvidenceGate,
  evaluateEvidenceGates,
  anomalyDetectionConfig,
  evaluateAnomaly,
  quarantineDecision,
  buildTissueEvidenceContext,
  isSafeToProceed
};