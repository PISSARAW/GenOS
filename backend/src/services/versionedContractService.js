'use strict';

const crypto = require('node:crypto');

const CONTRACT_VERSION = 'v1';
const SCHEMAS = Object.freeze({
  MorphogeneticCandidate: ['id', 'parentIds', 'genome', 'origin', 'metrics', 'status'],
  WorldTransition: ['stateBefore', 'action', 'delta', 'stateAfter', 'context', 'evidenceRefs', 'observedAt'],
  VerifiedRendering: ['sentences', 'verification'],
  CausalInterventionReceipt: ['experimentId', 'snapshotId', 'control', 'intervention', 'seeds', 'replicates', 'metricsBefore', 'metricsAfter', 'pairedEffects', 'verdict', 'evidenceRefs'],
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

const validators = { MorphogeneticCandidate: validateMorphogenetic, WorldTransition: validateWorld, VerifiedRendering: validateRendering, CausalInterventionReceipt: validateCausal };

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
