'use strict';

const crypto = require('node:crypto');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');

const CONTRACT_TYPE = 'EndogenousThoughtRun';
const CONTRACT_VERSION = 'v1';
const FIELDS = new Set(['runId', 'episodeId', 'projectId', 'taskId', 'bindingRef',
  'authorization', 'policyId', 'status', 'proposal', 'usage', 'budget', 'boundaries',
  'evidenceRefs', 'startedAt', 'completedAt']);
const BOUNDARIES = Object.freeze({ readOnly: true, networkAllowed: false,
  mutationAllowed: false, externalActionAllowed: false, workerSpawned: false,
  independentlyVerified: false, promotionEligible: false });

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringList(value) {
  return Array.isArray(value) && value.every(nonEmpty);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactFields(value, fields) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === fields.length && keys.every((key) => fields.includes(key));
}

function validTimestamp(value) {
  return nonEmpty(value) && !Number.isNaN(Date.parse(value));
}

function validResources(value, positive) {
  if (!exactFields(value, ['tokens', 'usd', 'seconds'])) return false;
  const floor = positive ? 1 : 0;
  return Number.isSafeInteger(value.tokens) && value.tokens >= floor
    && Number.isFinite(value.usd) && value.usd >= 0
    && Number.isSafeInteger(value.seconds) && value.seconds >= floor;
}

function validAuthorization(value) {
  return exactFields(value, ['ref', 'grantedBy', 'scope', 'expiresAt'])
    && nonEmpty(value.ref) && nonEmpty(value.grantedBy)
    && value.scope === 'ett-read-only-simulation' && validTimestamp(value.expiresAt);
}

function validProposal(value) {
  return exactFields(value, ['proposalId', 'hypothesis', 'method', 'falsifier',
    'expectedEvidence', 'sourceRefs']) && nonEmpty(value.proposalId)
    && nonEmpty(value.hypothesis) && nonEmpty(value.method) && nonEmpty(value.falsifier)
    && stringList(value.expectedEvidence) && value.expectedEvidence.length > 0
    && stringList(value.sourceRefs) && value.sourceRefs.length > 0;
}

function validBoundaries(value) {
  const fields = Object.keys(BOUNDARIES);
  return exactFields(value, fields) && fields.every((field) => value[field] === BOUNDARIES[field]);
}

function resourcesWithinBudget(usage, budget) {
  if (!validResources(usage, false) || !validResources(budget, true)) return false;
  return usage.tokens <= budget.tokens && usage.usd <= budget.usd
    && usage.seconds <= budget.seconds;
}

function validTiming(payload) {
  return validTimestamp(payload.startedAt) && validTimestamp(payload.completedAt)
    && Date.parse(payload.completedAt) >= Date.parse(payload.startedAt)
    && Date.parse(payload.completedAt) <= Date.parse(payload.authorization?.expiresAt);
}

function validateIdentity(payload, errors) {
  const identities = ['runId', 'episodeId', 'projectId', 'taskId', 'bindingRef', 'policyId'];
  if (identities.some((field) => !nonEmpty(payload[field]))) errors.push('identity');
  const keys = Object.keys(payload);
  if (keys.length !== FIELDS.size || keys.some((field) => !FIELDS.has(field))) errors.push('fields');
}

function validatePayload(payload) {
  if (!isRecord(payload)) return { valid: false, errors: ['payload'] };
  const errors = [];
  validateIdentity(payload, errors);
  if (!validAuthorization(payload.authorization)) errors.push('authorization');
  if (payload.status !== 'completed_unverified') errors.push('status');
  if (!validProposal(payload.proposal)) errors.push('proposal');
  if (!resourcesWithinBudget(payload.usage, payload.budget)) errors.push('resources');
  if (!validBoundaries(payload.boundaries)) errors.push('boundaries');
  if (!stringList(payload.evidenceRefs) || payload.evidenceRefs.length === 0) errors.push('evidence');
  if (!validTiming(payload)) errors.push('timestamp');
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
    throw Object.assign(new Error('Invalid EndogenousThoughtRun contract'), {
      code: 'INVALID_ENDOGENOUS_RUN_CONTRACT', errors: validation.errors });
  }
  return Object.freeze({ schema: `genos.${CONTRACT_TYPE}.receipt/${CONTRACT_VERSION}`,
    contractType: CONTRACT_TYPE, contractVersion: CONTRACT_VERSION,
    receiptId: receiptId(payload), sourceRefs: [...payload.evidenceRefs],
    issuedAt: payload.completedAt, payload: structuredClone(payload) });
}

function validEnvelope(receipt) {
  if (!isRecord(receipt)) return false;
  return receipt.schema === `genos.${CONTRACT_TYPE}.receipt/${CONTRACT_VERSION}`
    && receipt.contractType === CONTRACT_TYPE && receipt.contractVersion === CONTRACT_VERSION
    && nonEmpty(receipt.receiptId) && isRecord(receipt.payload);
}

function readReceipt(receipt) {
  if (!validEnvelope(receipt)) return { valid: false, errors: ['envelope'] };
  const validation = validatePayload(receipt.payload);
  const sourcesMatch = JSON.stringify(receipt.sourceRefs) === JSON.stringify(receipt.payload.evidenceRefs);
  const sealed = receipt.receiptId === receiptId(receipt.payload)
    && receipt.issuedAt === receipt.payload.completedAt && sourcesMatch;
  if (!sealed) validation.errors.push('envelope-integrity');
  return { valid: validation.errors.length === 0, errors: validation.errors };
}

module.exports = { BOUNDARIES, CONTRACT_TYPE, CONTRACT_VERSION,
  createReceipt, readReceipt, validatePayload };
