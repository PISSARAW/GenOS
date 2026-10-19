'use strict';

const crypto = require('node:crypto');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');

const CONTRACT_TYPE = 'EndogenousThoughtLearning';
const CONTRACT_VERSION = 'v1';
const VERDICTS = new Set(['supported', 'refuted', 'inconclusive']);
const FIELDS = new Set(['learningId', 'episodeId', 'projectId', 'agentId', 'runId',
  'verificationId', 'verificationRef', 'questionRef', 'policyId', 'authorizationRef',
  'verdict', 'revision', 'evidenceRefs', 'boundaries', 'learnedAt']);
const BOUNDARIES = Object.freeze({ verifiedInputOnly: true, episodeScoped: true,
  productionMemoryMutated: true, continuationAuthorized: false,
  externalActionAllowed: false, promotionEligible: false });

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactFields(value, fields) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === fields.length && keys.every((key) => fields.includes(key));
}

function digest(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function learningIdFor(value) {
  const basis = { projectId: value.projectId, episodeId: value.episodeId,
    verificationId: value.verificationId, policyId: value.policyId };
  return `ett_learning_${digest(basis).slice(0, 24)}`;
}

function revisionFor(verdict) {
  if (verdict === 'supported') return { operation: 'reinforce', priorStatus: 'unresolved',
    revisedStatus: 'provisionally_supported', applied: true };
  if (verdict === 'refuted') return { operation: 'correct', priorStatus: 'unresolved',
    revisedStatus: 'refuted_in_scope', applied: true };
  return { operation: 'defer', priorStatus: 'unresolved',
    revisedStatus: 'unresolved', applied: false };
}

function validRevision(payload) {
  const fields = ['operation', 'priorStatus', 'revisedStatus', 'applied'];
  return exactFields(payload.revision, fields)
    && canonicalJson(payload.revision) === canonicalJson(revisionFor(payload.verdict));
}

function validBoundaries(value) {
  const fields = Object.keys(BOUNDARIES);
  return exactFields(value, fields) && fields.every((field) => value[field] === BOUNDARIES[field]);
}

function validEvidence(payload) {
  const refs = payload.evidenceRefs;
  return Array.isArray(refs) && refs.length >= 2 && refs.every(nonEmpty)
    && new Set(refs).size === refs.length && refs.includes(payload.verificationRef)
    && refs.includes(payload.questionRef);
}

function validateIdentity(payload, errors) {
  const identities = ['learningId', 'episodeId', 'projectId', 'agentId', 'runId',
    'verificationId', 'verificationRef', 'questionRef', 'policyId', 'authorizationRef'];
  const keys = Object.keys(payload);
  if (identities.some((field) => !nonEmpty(payload[field]))) errors.push('identity');
  if (keys.length !== FIELDS.size || keys.some((field) => !FIELDS.has(field))) errors.push('fields');
  if (payload.learningId !== learningIdFor(payload)) errors.push('identity');
}

function validateSemantics(payload, errors) {
  if (!VERDICTS.has(payload.verdict)) errors.push('verdict');
  if (!validRevision(payload)) errors.push('revision');
  if (!validEvidence(payload)) errors.push('evidence');
  if (!validBoundaries(payload.boundaries)) errors.push('boundaries');
  const validTime = nonEmpty(payload.learnedAt) && !Number.isNaN(Date.parse(payload.learnedAt));
  if (!validTime) errors.push('timestamp');
}

function validatePayload(payload) {
  if (!isRecord(payload)) return { valid: false, errors: ['payload'] };
  const errors = [];
  validateIdentity(payload, errors);
  validateSemantics(payload, errors);
  return { valid: errors.length === 0, errors };
}

function receiptId(payload) {
  return `rcpt_${digest(`${CONTRACT_TYPE}:${canonicalJson(payload)}`).slice(0, 24)}`;
}

function createReceipt(payload) {
  const validation = validatePayload(payload);
  if (!validation.valid) {
    throw Object.assign(new Error('Invalid EndogenousThoughtLearning contract'), {
      code: 'INVALID_ENDOGENOUS_LEARNING_CONTRACT', errors: validation.errors });
  }
  return Object.freeze({ schema: `genos.${CONTRACT_TYPE}.receipt/${CONTRACT_VERSION}`,
    contractType: CONTRACT_TYPE, contractVersion: CONTRACT_VERSION,
    receiptId: receiptId(payload), sourceRefs: [...payload.evidenceRefs],
    issuedAt: payload.learnedAt, payload: structuredClone(payload) });
}

function readReceipt(receipt) {
  const envelope = isRecord(receipt)
    && receipt.schema === `genos.${CONTRACT_TYPE}.receipt/${CONTRACT_VERSION}`
    && receipt.contractType === CONTRACT_TYPE && receipt.contractVersion === CONTRACT_VERSION
    && nonEmpty(receipt.receiptId) && isRecord(receipt.payload);
  if (!envelope) return { valid: false, errors: ['envelope'] };
  const validation = validatePayload(receipt.payload);
  const sealed = receipt.receiptId === receiptId(receipt.payload)
    && receipt.issuedAt === receipt.payload.learnedAt
    && canonicalJson(receipt.sourceRefs) === canonicalJson(receipt.payload.evidenceRefs);
  if (!sealed) validation.errors.push('envelope-integrity');
  return { valid: validation.errors.length === 0, errors: validation.errors };
}

module.exports = { BOUNDARIES, CONTRACT_TYPE, CONTRACT_VERSION, createReceipt,
  learningIdFor, readReceipt, revisionFor, validatePayload };
