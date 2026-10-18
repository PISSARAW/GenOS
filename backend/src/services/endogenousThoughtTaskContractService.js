'use strict';

const crypto = require('node:crypto');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');

const CONTRACT_TYPE = 'EndogenousThoughtTaskBinding';
const CONTRACT_VERSION = 'v1';
const FIELDS = new Set(['bindingId', 'episodeId', 'projectId', 'questionRef', 'decisionRef',
  'taskId', 'policyId', 'title', 'priority', 'acceptance', 'holdState', 'evidenceRefs',
  'boundaries', 'queuedAt']);

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringList(value) {
  return Array.isArray(value) && value.every(nonEmpty);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validBoundaries(value) {
  const fields = ['executionAuthorized', 'workerStarted', 'externalActionAllowed', 'promotionEligible'];
  return isRecord(value) && Object.keys(value).length === fields.length
    && fields.every((field) => value[field] === false);
}

function missingIdentity(payload, identities) {
  for (const field of identities) {
    if (!nonEmpty(payload[field])) return true;
  }
  return false;
}

function invalidFields(payload) {
  const keys = Object.keys(payload);
  if (keys.length !== FIELDS.size) return true;
  return keys.some((field) => !FIELDS.has(field));
}

function validateIdentity(payload, errors) {
  const identities = ['bindingId', 'episodeId', 'projectId', 'questionRef', 'decisionRef',
    'taskId', 'policyId', 'title'];
  if (missingIdentity(payload, identities)) errors.push('identity');
  if (invalidFields(payload)) errors.push('fields');
}

function validPriority(value) {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}

function nonEmptyList(value) {
  return stringList(value) && value.length > 0;
}

function validTimestamp(value) {
  return nonEmpty(value) && !Number.isNaN(Date.parse(value));
}

function validateTask(payload, errors) {
  if (!validPriority(payload.priority)) errors.push('priority');
  if (!nonEmptyList(payload.acceptance)) errors.push('acceptance');
  if (payload.holdState !== 'blocked') errors.push('holdState');
}

function validateEvidence(payload, errors) {
  if (!nonEmptyList(payload.evidenceRefs)) errors.push('evidence');
  if (!validBoundaries(payload.boundaries)) errors.push('boundaries');
  if (!validTimestamp(payload.queuedAt)) errors.push('timestamp');
}

function validatePayload(payload) {
  if (!isRecord(payload)) return { valid: false, errors: ['payload'] };
  const errors = [];
  validateIdentity(payload, errors);
  validateTask(payload, errors);
  validateEvidence(payload, errors);
  return { valid: errors.length === 0, errors };
}

function receiptId(payload) {
  const hash = crypto.createHash('sha256')
    .update(`${CONTRACT_TYPE}:${canonicalJson(payload)}`).digest('hex');
  return `rcpt_${hash.slice(0, 24)}`;
}

function createReceipt(payload) {
  const validation = validatePayload(payload);
  if (!validation.valid) {
    throw Object.assign(new Error('Invalid EndogenousThoughtTaskBinding contract'), {
      code: 'INVALID_ENDOGENOUS_TASK_CONTRACT', errors: validation.errors });
  }
  return Object.freeze({ schema: `genos.${CONTRACT_TYPE}.receipt/${CONTRACT_VERSION}`,
    contractType: CONTRACT_TYPE, contractVersion: CONTRACT_VERSION,
    receiptId: receiptId(payload), sourceRefs: [...payload.evidenceRefs],
    issuedAt: payload.queuedAt, payload: structuredClone(payload) });
}

function validEnvelope(receipt) {
  if (!isRecord(receipt)) return false;
  const expectedSchema = `genos.${CONTRACT_TYPE}.receipt/${CONTRACT_VERSION}`;
  return [receipt.schema === expectedSchema, receipt.contractType === CONTRACT_TYPE,
    receipt.contractVersion === CONTRACT_VERSION, nonEmpty(receipt.receiptId),
    isRecord(receipt.payload)].every(Boolean);
}

function matchingSourceRefs(receipt) {
  if (!stringList(receipt.sourceRefs)) return false;
  return JSON.stringify(receipt.sourceRefs) === JSON.stringify(receipt.payload.evidenceRefs);
}

function sealedEnvelope(receipt) {
  return [receipt.receiptId === receiptId(receipt.payload),
    receipt.issuedAt === receipt.payload.queuedAt,
    matchingSourceRefs(receipt)].every(Boolean);
}

function readReceipt(receipt) {
  if (!validEnvelope(receipt)) return { valid: false, errors: ['envelope'] };
  const validation = validatePayload(receipt.payload);
  if (!sealedEnvelope(receipt)) validation.errors.push('envelope-integrity');
  return { valid: validation.errors.length === 0, errors: validation.errors };
}

module.exports = { CONTRACT_TYPE, CONTRACT_VERSION, createReceipt, readReceipt, validatePayload };
