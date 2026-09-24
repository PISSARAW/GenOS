'use strict';

const { QUESTION_TYPES } = require('../question/questionClassifier');

function validateConstitution(value) {
  const errors = [];
  requireString(value?.constitutionId, 'constitutionId', errors);
  requireString(value?.communityId, 'communityId', errors);
  if (!QUESTION_TYPES.includes(value?.constitution?.questionType)) errors.push('questionType is invalid.');
  requireString(value?.constitution?.evidenceStandard, 'evidenceStandard', errors);
  requireString(value?.constitution?.aggregationPolicy, 'aggregationPolicy', errors);
  if (!Array.isArray(value?.constitution?.roles) || !value.constitution.roles.length) errors.push('roles must be a non-empty array.');
  if (!positiveInteger(value?.version)) errors.push('version must be a positive integer.');
  if (!positiveInteger(value?.constitution?.roundLimit)) errors.push('roundLimit must be a positive integer.');
  checkPolicies(value?.constitution, errors);
  requireString(value?.constitutionHash, 'constitutionHash', errors);
  return { valid: errors.length === 0, errors };
}

function requireString(value, name, errors) {
  if (typeof value !== 'string' || !value.trim()) errors.push(`${name} is required.`);
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function checkPolicies(constitution, errors) {
  const fields = ['independenceRequirements', 'quorumPolicy', 'abstentionPolicy', 'dissentPolicy',
    'minorityEscalationPolicy', 'stoppingRule', 'verificationPolicy', 'escalationPolicy'];
  for (const field of fields) {
    if (!constitution?.[field] || typeof constitution[field] !== 'object') errors.push(`${field} must be an object.`);
  }
}

module.exports = { validateConstitution };
