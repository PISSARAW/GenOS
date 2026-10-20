'use strict';

const { validateProtocolV2 } = require('./endogenousThoughtProtocolV2Service');

const REQUIRED_CONDITIONS = Object.freeze([
  'full', 'planned_control', 'curiosity_ablated', 'shev_initiative_ablated',
  'agow_arbitration_ablated', 'metacognition_ablated', 'memory_ablated'
]);
const DIRECTIONS = new Set(['higher', 'lower']);
const METRIC_KINDS = new Set(['ratio', 'difference']);

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringList(value) {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmpty);
}

function validateMetricSet(input) {
  const errors = [];
  if (input?.schema !== 'genos.endogenous-thought-metrics/v1') errors.push('metrics-schema-invalide');
  if (input?.promotionEligible !== false) errors.push('metrics-promotion-interdite');
  const metrics = Array.isArray(input?.metrics) ? input.metrics : [];
  if (!metrics.length) errors.push('metrics-requises');
  const ids = metrics.map((metric) => metric?.id).filter(nonEmpty);
  if (ids.length !== metrics.length || new Set(ids).size !== ids.length) errors.push('metric-ids-invalides');
  for (const metric of metrics) validateMetric(metric, errors);
  if (!ids.includes(input?.primaryMetricId)) errors.push('metrique-primaire-inconnue');
  validateNormalization(input?.normalization, errors);
  return { valid: errors.length === 0, errors };
}

function validateMetric(metric, errors) {
  if (!METRIC_KINDS.has(metric?.kind) || !DIRECTIONS.has(metric?.direction)) errors.push('metric-type-invalide');
  if (!nonEmpty(metric?.unit) || !nonEmpty(metric?.definition)) errors.push('metric-definition-invalide');
  if (!stringList(metric?.requires)) errors.push('metric-preuves-requises');
}

function validateNormalization(normalization, errors) {
  if (!nonEmpty(normalization?.formula) || !nonEmpty(normalization?.zeroDenominatorPolicy)) {
    errors.push('normalisation-invalide');
  }
  if (normalization?.minimumDenominator !== 1) errors.push('normalisation-plancher-invalide');
}

function validateProtocol(protocol, metricSet) {
  if (protocol?.schema === 'genos.endogenous-thought-protocol/v2') {
    const metricErrors = validateMetricSet(metricSet).errors;
    const result = validateProtocolV2(protocol, metricSet);
    const errors = [...new Set([...metricErrors, ...result.errors])];
    return { valid: errors.length === 0, errors };
  }
  const errors = [...validateMetricSet(metricSet).errors];
  validateProtocolIdentity(protocol, metricSet, errors);
  validateProtocolConditions(protocol, errors);
  validateProtocolCorpus(protocol, errors);
  validateProtocolSafety(protocol, errors);
  return { valid: errors.length === 0, errors };
}

function validateProtocolIdentity(protocol, metricSet, errors) {
  if (protocol?.schema !== 'genos.endogenous-thought-protocol/v1'
    || protocol?.status !== 'preregistered_not_run') errors.push('protocole-identite-invalide');
  if (protocol?.promotionDecision !== null || protocol?.evidencePolicy?.scientificPromotionAllowed !== false) {
    errors.push('promotion-protocole-interdite');
  }
  if (protocol?.primaryMetricId !== metricSet?.primaryMetricId) errors.push('metrique-primaire-incoherente');
  if (protocol?.scope?.externalPromptAfterStart !== false || protocol?.scope?.mutationsAllowed !== false) {
    errors.push('portee-ett-invalide');
  }
}

function validateProtocolConditions(protocol, errors) {
  const conditions = Array.isArray(protocol?.conditions) ? protocol.conditions : [];
  if (new Set(conditions).size !== conditions.length
    || REQUIRED_CONDITIONS.some((condition) => !conditions.includes(condition))) {
    errors.push('conditions-ett-incompletes');
  }
}

function validateProtocolCorpus(protocol, errors) {
  const development = protocol?.corpus?.developmentSeeds;
  const reserved = protocol?.corpus?.reservedSeeds;
  const valid = Array.isArray(development) && development.length > 0
    && Array.isArray(reserved) && reserved.length > 0
    && development.every(Number.isSafeInteger) && reserved.every(Number.isSafeInteger)
    && development.every((seed) => !reserved.includes(seed));
  if (!valid || protocol?.analysisPlan?.reservedCorpusUsedForTuning !== false) {
    errors.push('corpus-reserve-invalide');
  }
}

function validateProtocolSafety(protocol, errors) {
  const boundary = protocol?.safetyBoundary || {};
  const intact = ['authorityAblated', 'sandboxAblated', 'budgetEnforcementAblated', 'evidenceGateAblated']
    .every((field) => boundary[field] === false);
  if (!intact || protocol?.evidencePolicy?.modelOutputIsEvidence !== false
    || protocol?.evidencePolicy?.independentVerificationRequired !== true) {
    errors.push('frontiere-securite-invalide');
  }
}

module.exports = { REQUIRED_CONDITIONS, validateMetricSet, validateProtocol };
