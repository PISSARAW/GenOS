'use strict';

const crypto = require('node:crypto');

const CONTRACT_VERSION = 'v1';
const SCHEMAS = Object.freeze({
  MorphogeneticCandidate: ['id', 'parentIds', 'genome', 'origin', 'metrics', 'status'],
  WorldTransition: ['stateBefore', 'action', 'delta', 'stateAfter', 'context', 'evidenceRefs', 'observedAt'],
  VerifiedRendering: ['sentences', 'verification'],
  CausalInterventionReceipt: ['experimentId', 'snapshotId', 'control', 'intervention', 'seeds', 'replicates', 'metricsBefore', 'metricsAfter', 'pairedEffects', 'verdict', 'evidenceRefs'],
  IndicatorEvaluation: ['evaluationSchema', 'receiptCount', 'propertyCount', 'assessment', 'reportHash', 'report'],
  MissionPhysicsParameterSet: ['missionClass', 'parameterId', 'version', 'unit', 'value', 'uncertainty', 'bounds', 'sampleCount', 'sourceRefs', 'trainingHash', 'validation', 'state', 'previousReceiptId'],
});

const STATUSES = new Set(['candidate', 'niche', 'promoted', 'dormant', 'fossilized', 'extinct']);
const VERDICTS = new Set(['supported', 'refuted', 'inconclusive']);
const RENDERING_STATUSES = new Set(['verified', 'repaired', 'blocked']);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringList(value) {
  return Array.isArray(value) && value.every(nonEmpty);
}

function error(code, message, path = '') {
  return { code, path, message };
}

function pushRequired(errors, payload, fields) {
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) errors.push(error('REQUIRED_FIELD', `Missing required field: ${field}`, field));
  }
}

function rejectUnknown(errors, payload, fields) {
  const allowed = new Set(fields);
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) errors.push(error('UNKNOWN_FIELD', `Unknown field: ${key}`, key));
  }
}

function validateMorphogenetic(payload, errors) {
  if (!nonEmpty(payload.id)) errors.push(error('INVALID_ID', 'id must be a non-empty string', 'id'));
  if (!stringList(payload.parentIds)) errors.push(error('INVALID_LIST', 'parentIds must be a string list', 'parentIds'));
  if (!isRecord(payload.genome) || !nonEmpty(payload.genome.ontology)) errors.push(error('INVALID_GENOME', 'genome.ontology is required', 'genome'));
  if (!isRecord(payload.origin) || !nonEmpty(payload.origin.kind)) errors.push(error('INVALID_ORIGIN', 'origin.kind is required', 'origin'));
  if (!isRecord(payload.metrics)) errors.push(error('INVALID_METRICS', 'metrics must be an object', 'metrics'));
  if (!STATUSES.has(payload.status)) errors.push(error('INVALID_STATUS', 'unknown morphogenetic status', 'status'));
}

function validateWorld(payload, errors) {
  if (!isRecord(payload.stateBefore) || !isRecord(payload.stateAfter)) errors.push(error('INVALID_STATE', 'stateBefore and stateAfter must be objects', 'state'));
  if (!nonEmpty(payload.action)) errors.push(error('INVALID_ACTION', 'action must be a non-empty string', 'action'));
  if (!isRecord(payload.delta)) errors.push(error('INVALID_DELTA', 'delta must be an object', 'delta'));
  if (!isRecord(payload.context) || !nonEmpty(payload.context.missionClass)) errors.push(error('INVALID_CONTEXT', 'context.missionClass is required', 'context'));
  if (!stringList(payload.evidenceRefs)) errors.push(error('INVALID_LIST', 'evidenceRefs must be a string list', 'evidenceRefs'));
  if (!nonEmpty(payload.observedAt) || Number.isNaN(Date.parse(payload.observedAt))) errors.push(error('INVALID_TIMESTAMP', 'observedAt must be an ISO timestamp', 'observedAt'));
}

function validateRendering(payload, errors) {
  const sentences = Array.isArray(payload.sentences) ? payload.sentences : [];
  if (!sentences.length) errors.push(error('INVALID_SENTENCES', 'sentences must be a non-empty list', 'sentences'));
  sentences.forEach((sentence, index) => validateSentence(sentence, index, errors));
  validateVerification(payload.verification, errors);
}

function validateSentence(sentence, index, errors) {
  const kinds = ['factual', 'connective', 'uncertainty', 'recommendation'];
  const valid = isRecord(sentence) && nonEmpty(sentence.text) && kinds.includes(sentence.kind) && stringList(sentence.claimIds);
  if (!valid) errors.push(error('INVALID_SENTENCE', 'sentence requires text, kind and claimIds', `sentences.${index}`));
}

function validateVerification(verification, errors) {
  const valid = isRecord(verification) && RENDERING_STATUSES.has(verification.status) && Array.isArray(verification.violations);
  if (!valid) errors.push(error('INVALID_VERIFICATION', 'verification requires a known status and violations list', 'verification'));
}

function validateCausal(payload, errors) {
  requireCausalReferences(payload, errors);
  requireCausalArms(payload, errors);
  requireCausalReplicates(payload, errors);
  for (const field of ['metricsBefore', 'metricsAfter', 'pairedEffects']) validateObjectField(payload, field, errors);
  if (!VERDICTS.has(payload.verdict)) errors.push(error('INVALID_VERDICT', 'unknown causal verdict', 'verdict'));
  if (!stringList(payload.evidenceRefs)) errors.push(error('INVALID_LIST', 'evidenceRefs must be a string list', 'evidenceRefs'));
}

function validateIndicatorEvaluation(payload, errors) {
  validateEvaluationSchema(payload, errors);
  validateEvaluationCounts(payload, errors);
  validateEvaluationAssessment(payload, errors);
  validateEvaluationHash(payload, errors);
  validateIndicatorReport(payload, errors);
}

function validateMissionPhysicsParameter(payload, errors) {
  validatePhysicsIdentity(payload, errors);
  validatePhysicsEstimate(payload, errors);
  validatePhysicsBounds(payload, errors);
  validatePhysicsProvenance(payload, errors);
  validatePhysicsValidation(payload, errors);
  validatePhysicsPreviousReceipt(payload, errors);
}

function validatePhysicsIdentity(payload, errors) {
  const fields = ['missionClass', 'parameterId', 'unit'];
  if (fields.some((field) => !nonEmpty(payload[field]))) {
    errors.push(error('INVALID_PARAMETER', 'missionClass, parameterId and unit are required', 'identity'));
  }
  if (!Number.isInteger(payload.version) || payload.version < 1
    || !Number.isInteger(payload.sampleCount) || payload.sampleCount < 3) {
    errors.push(error('INVALID_VERSION_OR_COUNT', 'version and sampleCount are invalid', 'version'));
  }
}

function validatePhysicsEstimate(payload, errors) {
  if (!Number.isFinite(payload.value) || !Number.isFinite(payload.uncertainty) || payload.uncertainty < 0) {
    errors.push(error('INVALID_ESTIMATE', 'value and non-negative uncertainty are required', 'value'));
  }
}

function validatePhysicsBounds(payload, errors) {
  const validBounds = isRecord(payload.bounds) && Number.isFinite(payload.bounds.min)
    && Number.isFinite(payload.bounds.max) && payload.bounds.min <= payload.bounds.max;
  if (!validBounds || payload.value < payload.bounds.min || payload.value > payload.bounds.max) {
    errors.push(error('INVALID_BOUNDS', 'value must remain within explicit bounds', 'bounds'));
  }
}

function validatePhysicsProvenance(payload, errors) {
  const validRefs = stringList(payload.sourceRefs) && payload.sourceRefs.length >= 5
    && new Set(payload.sourceRefs).size === payload.sourceRefs.length;
  if (!validRefs) errors.push(error('INVALID_PROVENANCE', 'At least five distinct sample references are required', 'sourceRefs'));
  if (!/^[a-f0-9]{64}$/.test(payload.trainingHash || '')) {
    errors.push(error('INVALID_HASH', 'trainingHash must be a SHA-256 digest', 'trainingHash'));
  }
}

function validatePhysicsValidation(payload, errors) {
  const stateValid = ['candidate', 'active', 'rolled_back'].includes(payload.state);
  if (!stateValid || !validHoldoutReceipt(payload.validation)) {
    errors.push(error('INVALID_VALIDATION', 'Parameter requires passed holdout validation and known state', 'validation'));
  }
}

function validHoldoutReceipt(validation) {
  return isRecord(validation) && validation.status === 'passed'
    && Number.isInteger(validation.sampleCount) && validation.sampleCount >= 2
    && Number.isFinite(validation.observedDrift) && Number.isFinite(validation.maxDrift)
    && validation.observedDrift <= validation.maxDrift;
}

function validatePhysicsPreviousReceipt(payload, errors) {
  if (payload.previousReceiptId !== null && !nonEmpty(payload.previousReceiptId)) {
    errors.push(error('INVALID_REFERENCE', 'previousReceiptId must be a receipt ID or null', 'previousReceiptId'));
  }
}

function validateEvaluationSchema(payload, errors) {
  if (!nonEmpty(payload.evaluationSchema) || !payload.evaluationSchema.startsWith('genos.indicator-evaluation')) {
    errors.push(error('INVALID_EVALUATION', 'evaluationSchema must identify an indicator evaluation', 'evaluationSchema'));
  }
}

function validateEvaluationCounts(payload, errors) {
  if (!Number.isInteger(payload.receiptCount) || payload.receiptCount < 1) errors.push(error('INVALID_COUNT', 'receiptCount must be positive', 'receiptCount'));
  if (!Number.isInteger(payload.propertyCount) || payload.propertyCount < 1) errors.push(error('INVALID_COUNT', 'propertyCount must be positive', 'propertyCount'));
}

function validateEvaluationAssessment(payload, errors) {
  if (!nonEmpty(payload.assessment) || payload.assessment.includes('promotion')) {
    errors.push(error('INVALID_ASSESSMENT', 'assessment must describe a non-promoting evaluation', 'assessment'));
  }
}

function validateEvaluationHash(payload, errors) {
  if (!/^[a-f0-9]{64}$/.test(payload.reportHash || '')) {
    errors.push(error('INVALID_HASH', 'reportHash must be a SHA-256 digest', 'reportHash'));
  }
}

function validateIndicatorReport(payload, errors) {
  const report = payload.report;
  if (!isRecord(report) || report.promotionEligible !== false || !Array.isArray(report.properties)) {
    errors.push(error('INVALID_REPORT', 'report must be a non-promoting evaluation with properties', 'report'));
    return;
  }
  if (report.schema !== payload.evaluationSchema || report.receiptCount !== payload.receiptCount
    || report.properties.length !== payload.propertyCount || report.assessment !== payload.assessment) {
    errors.push(error('INVALID_REPORT', 'report summary fields do not match the receipt fields', 'report'));
  }
  const digest = crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
  if (payload.reportHash !== digest) errors.push(error('INVALID_HASH', 'reportHash does not match report content', 'reportHash'));
}

function requireCausalReferences(payload, errors) {
  if (!nonEmpty(payload.experimentId) || !nonEmpty(payload.snapshotId)) errors.push(error('INVALID_REFERENCE', 'experimentId and snapshotId are required', 'references'));
}

function requireCausalArms(payload, errors) {
  if (!isRecord(payload.control) || !isRecord(payload.intervention)) errors.push(error('INVALID_ARM', 'control and intervention must be objects', 'arms'));
}

function requireCausalReplicates(payload, errors) {
  const validSeeds = Array.isArray(payload.seeds) && payload.seeds.length > 0 && payload.seeds.every(Number.isInteger);
  if (!validSeeds) errors.push(error('INVALID_SEEDS', 'seeds must contain integer values', 'seeds'));
  const validCount = Number.isInteger(payload.replicates) && payload.replicates > 0 && payload.replicates === (payload.seeds || []).length;
  if (!validCount) errors.push(error('INVALID_REPLICATES', 'replicates must equal the number of seeds', 'replicates'));
}

function validateObjectField(payload, field, errors) {
  if (!isRecord(payload[field])) errors.push(error('INVALID_METRICS', `${field} must be an object`, field));
}

const validators = { MorphogeneticCandidate: validateMorphogenetic, WorldTransition: validateWorld, VerifiedRendering: validateRendering, CausalInterventionReceipt: validateCausal, IndicatorEvaluation: validateIndicatorEvaluation, MissionPhysicsParameterSet: validateMissionPhysicsParameter };

function validateContract(type, payload) {
  const errors = [];
  const fields = SCHEMAS[type];
  if (!fields) return { valid: false, errors: [error('UNKNOWN_CONTRACT', `Unknown contract type: ${type}`)] };
  if (!isRecord(payload)) return { valid: false, errors: [error('INVALID_PAYLOAD', 'Contract payload must be an object')] };
  pushRequired(errors, payload, fields);
  rejectUnknown(errors, payload, fields);
  if (!errors.length) validators[type](payload, errors);
  return { valid: errors.length === 0, errors, type, contractVersion: CONTRACT_VERSION };
}

function stableId(type, payload) {
  return crypto.createHash('sha256').update(`${type}:${JSON.stringify(payload)}`).digest('hex').slice(0, 24);
}

function createReceipt(type, payload, metadata = {}) {
  const result = validateContract(type, payload);
  if (!result.valid) {
    const exception = new Error(`Invalid ${type} contract`);
    exception.code = 'INVALID_VERSIONED_CONTRACT';
    exception.errors = result.errors;
    throw exception;
  }
  const body = structuredClone(payload);
  return Object.freeze({
    schema: `genos.${type}.receipt/${CONTRACT_VERSION}`,
    contractType: type,
    contractVersion: CONTRACT_VERSION,
    receiptId: metadata.receiptId || `rcpt_${stableId(type, body)}`,
    runId: nonEmpty(metadata.runId) ? metadata.runId : null,
    sourceRefs: stringList(metadata.sourceRefs) ? [...metadata.sourceRefs] : [],
    issuedAt: nonEmpty(metadata.issuedAt) ? metadata.issuedAt : new Date().toISOString(),
    payload: body,
  });
}

function readReceipt(receipt) {
  if (!isRecord(receipt) || !nonEmpty(receipt.schema) || !nonEmpty(receipt.contractType) || receipt.contractVersion !== CONTRACT_VERSION || !nonEmpty(receipt.receiptId) || !isRecord(receipt.payload)) {
    return { valid: false, errors: [error('INVALID_RECEIPT', 'Receipt envelope is incomplete')] };
  }
  const expected = `genos.${receipt.contractType}.receipt/${CONTRACT_VERSION}`;
  if (receipt.schema !== expected) return { valid: false, errors: [error('SCHEMA_MISMATCH', 'Receipt schema does not match contract type')] };
  const result = validateContract(receipt.contractType, receipt.payload);
  return { ...result, receiptId: receipt.receiptId };
}

module.exports = { CONTRACT_VERSION, SCHEMAS, createReceipt, readReceipt, validateContract };
