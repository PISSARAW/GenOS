'use strict';

const { HANDOFF_STATUS, HANDOFF_TYPES } = require('../constants');
const { isRecord, isNonEmpty, isStringList, result } = require('./contractValidation');

function validateHandoff(handoff) {
  const errors = [];
  if (!isRecord(handoff)) return result(['Handoff must be an object.']);
  validateHandoffIdentity(handoff, errors);
  validateHandoffReferences(handoff, errors);
  validateTextLists(handoff, errors);
  return result(errors);
}

function validateHandoffIdentity(handoff, errors) {
  if (!isNonEmpty(handoff.handoffId)) errors.push('handoffId is required.');
  if (!HANDOFF_TYPES.includes(handoff.type)) errors.push('handoff type is invalid.');
  validateParty(handoff.producer, 'producer', errors);
  validateParty(handoff.consumer, 'consumer', errors);
  if (!Number.isInteger(handoff.version) || handoff.version < 1) errors.push('version must be a positive integer.');
  if (!HANDOFF_STATUS.includes(handoff.status)) errors.push('handoff status is invalid.');
}

function validateHandoffReferences(handoff, errors) {
  for (const field of ['artifactRefs', 'claimRefs', 'evidenceRefs']) {
    if (!Array.isArray(handoff[field])) errors.push(`${field} must be an array.`);
  }
  if (Array.isArray(handoff.evidenceRefs) && handoff.evidenceRefs.length === 0) errors.push('evidenceRefs must contain at least one reference.');
}

function validateParty(value, name, errors) {
  if (!isRecord(value) || !isNonEmpty(value.agentId)) errors.push(`${name}.agentId is required.`);
}

function validateTextLists(handoff, errors) {
  for (const field of ['assumptions', 'preconditions', 'postconditions', 'invariants', 'knownRisks', 'openQuestions', 'acceptanceCriteria']) {
    if (handoff[field] !== undefined && !isStringList(handoff[field])) errors.push(`${field} must be an array of non-empty strings.`);
  }
}

module.exports = { validateHandoff };
