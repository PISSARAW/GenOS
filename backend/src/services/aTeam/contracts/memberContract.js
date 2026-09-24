'use strict';

const { MEMBER_STATUS, PARTICIPATION_MODES } = require('../constants');
const { isRecord, isNonEmpty, isStringList, result } = require('./contractValidation');
const { validateResponsibility } = require('./responsibilityContract');

function validateMember(member) {
  const errors = [];
  if (!isRecord(member)) return result(['Member must be an object.']);
  validateMemberIdentity(member, errors);
  validateMemberScopes(member, errors);
  validateMemberState(member, errors);
  return result(errors);
}

function validateMemberIdentity(member, errors) {
  if (!isNonEmpty(member.memberId)) errors.push('memberId is required.');
  if (member.agentId !== null && member.agentId !== undefined && !isNonEmpty(member.agentId)) errors.push('agentId must be a non-empty string or null.');
  if (!isNonEmpty(member.role)) errors.push('role is required.');
  if (!isStringList(member.expertise)) errors.push('expertise must be an array of non-empty strings.');
}

function validateMemberScopes(member, errors) {
  if (!isStringList(member.ownedResponsibilities)) errors.push('ownedResponsibilities must be an array of non-empty strings.');
  for (const field of ['consumes', 'provides', 'consults', 'toolLease']) validateListField(member, field, errors);
  validateAuthority(member.authority, errors);
}

function validateMemberState(member, errors) {
  if (!PARTICIPATION_MODES.includes(member.participationMode)) errors.push('participationMode is invalid.');
  if (!MEMBER_STATUS.includes(member.status)) errors.push('member status is invalid.');
}

function validateListField(member, field, errors) {
  if (!isStringList(member[field])) errors.push(`${field} must be an array of non-empty strings.`);
}

function validateAuthority(value, errors) {
  const validation = validateResponsibility(value);
  if (!validation.valid) errors.push(...validation.errors.map((error) => `authority: ${error}`));
}

module.exports = { validateMember };
