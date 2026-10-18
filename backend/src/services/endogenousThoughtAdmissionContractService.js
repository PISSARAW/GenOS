'use strict';

const crypto = require('node:crypto');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');

const CONTRACT_TYPE = 'EndogenousThoughtAdmission';
const CONTRACT_VERSION = 'v1';
const FIELDS = new Set(['decisionId', 'episodeId', 'questionRef', 'policyId', 'condition',
  'outcome', 'reason', 'selectedCandidateId', 'candidateIds', 'arbitration',
  'evidenceRefs', 'boundaries', 'decidedAt']);

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringList(value) {
  return Array.isArray(value) && value.every(nonEmpty);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateIdentity(payload, errors) {
  const identities = ['decisionId', 'episodeId', 'questionRef', 'policyId', 'condition', 'reason'];
  if (identities.some((field) => !nonEmpty(payload[field]))) errors.push('identity');
  if (Object.keys(payload).some((field) => !FIELDS.has(field)) || Object.keys(payload).length !== FIELDS.size) {
    errors.push('fields');
  }
}

function validateOutcome(payload, errors) {
  if (!['admitted', 'abstained'].includes(payload.outcome)) errors.push('outcome');
  if (!validSelection(payload)) errors.push('selection');
  if (!validCandidates(payload.candidateIds)) errors.push('candidates');
}

function validSelection(payload) {
  const selected = payload.selectedCandidateId;
  if (payload.outcome === 'admitted') {
    return nonEmpty(selected) && payload.candidateIds?.includes(selected);
  }
  if (payload.outcome === 'abstained') return selected === null;
  return false;
}

function validCandidates(candidateIds) {
  if (!stringList(candidateIds)) return false;
  return candidateIds.length > 0 && new Set(candidateIds).size === candidateIds.length;
}

function validArbitration(value) {
  return isRecord(value) && stringList(value.winners) && isRecord(value.activations)
    && Object.entries(value.activations).every(([key, score]) => nonEmpty(key)
      && Number.isFinite(score) && score >= 0)
    && Number.isInteger(value.rounds) && value.rounds >= 0 && value.controlRegret === false;
}

function closedBoundaries(value) {
  const fields = ['authorityGranted', 'promotionEligible', 'taskCreated',
    'externalActionAllowed', 'agowModeMutated'];
  return isRecord(value) && Object.keys(value).length === fields.length
    && fields.every((field) => value[field] === false);
}

function knownArbitration(payload) {
  const known = new Set(payload.candidateIds || []);
  const winnersKnown = payload.arbitration.winners.every((id) => known.has(id));
  const activationsKnown = Object.keys(payload.arbitration.activations)
    .every((id) => known.has(id));
  return winnersKnown && activationsKnown;
}

function selectedWinner(payload) {
  if (payload.outcome !== 'admitted') return true;
  return payload.arbitration.winners.includes(payload.selectedCandidateId);
}

function validEvidenceRefs(value) {
  return stringList(value) && value.length > 0;
}

function validTimestamp(value) {
  return nonEmpty(value) && !Number.isNaN(Date.parse(value));
}

function validateEvidence(payload, errors) {
  if (!validArbitration(payload.arbitration)) errors.push('arbitration');
  else {
    if (!knownArbitration(payload)) errors.push('arbitration');
    if (!selectedWinner(payload)) errors.push('selection');
  }
  if (!validEvidenceRefs(payload.evidenceRefs)) errors.push('evidence');
  if (!closedBoundaries(payload.boundaries)) errors.push('boundaries');
  if (!validTimestamp(payload.decidedAt)) errors.push('timestamp');
}

function validatePayload(payload) {
  if (!isRecord(payload)) return { valid: false, errors: ['payload'] };
  const errors = [];
  validateIdentity(payload, errors);
  validateOutcome(payload, errors);
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
    throw Object.assign(new Error('Invalid EndogenousThoughtAdmission contract'), {
      code: 'INVALID_ENDOGENOUS_ADMISSION_CONTRACT', errors: validation.errors });
  }
  return Object.freeze({ schema: `genos.${CONTRACT_TYPE}.receipt/${CONTRACT_VERSION}`,
    contractType: CONTRACT_TYPE, contractVersion: CONTRACT_VERSION,
    receiptId: receiptId(payload), sourceRefs: [...payload.evidenceRefs],
    issuedAt: payload.decidedAt, payload: structuredClone(payload) });
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
    receipt.issuedAt === receipt.payload.decidedAt,
    matchingSourceRefs(receipt)].every(Boolean);
}

function readReceipt(receipt) {
  if (!validEnvelope(receipt)) return { valid: false, errors: ['envelope'] };
  const validation = validatePayload(receipt.payload);
  if (!sealedEnvelope(receipt)) validation.errors.push('envelope-integrity');
  return { valid: validation.errors.length === 0, errors: validation.errors };
}

module.exports = { CONTRACT_TYPE, CONTRACT_VERSION, createReceipt, readReceipt, validatePayload };
