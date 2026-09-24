'use strict';

const { TEAM_RUN_STATUS, TEAM_RUN_PHASE } = require('../constants');
const { isRecord, isNonEmpty, isStringList, result } = require('./contractValidation');
const { validateMember } = require('./memberContract');

function validateTeamRun(run) {
  const errors = [];
  if (!isRecord(run)) return result(['ATeamRun must be an object.']);
  validateRequiredIdentity(run, errors);
  validateRunLists(run, errors);
  validateMembers(run.members, errors);
  validateRunState(run, errors);
  validateRunDates(run, errors);
  return result(errors);
}

function validateRequiredIdentity(run, errors) {
  for (const field of ['teamRunId', 'missionId', 'goal']) {
    if (!isNonEmpty(run[field])) errors.push(`${field} is required.`);
  }
  if (run.workGraphId !== null && run.workGraphId !== undefined && !isNonEmpty(run.workGraphId)) errors.push('workGraphId must be a non-empty string or null.');
  if (run.organization !== null && run.organization !== undefined && !isNonEmpty(run.organization)) errors.push('organization must be a non-empty string or null.');
}

function validateRunLists(run, errors) {
  for (const field of ['successCriteria', 'capabilityGaps']) {
    if (!isStringList(run[field])) errors.push(`${field} must be an array of non-empty strings.`);
  }
  validateCapabilities(run.requiredCapabilities, errors);
}

function validateCapabilities(capabilities, errors) {
  if (!Array.isArray(capabilities)) {
    errors.push('requiredCapabilities must be an array.');
    return;
  }
  capabilities.forEach((capability, index) => {
    const name = capability?.name || capability?.capability;
    if (!isRecord(capability) || !isNonEmpty(name) || !Number.isFinite(Number(capability.weight)) || Number(capability.weight) < 0) {
      errors.push(`requiredCapabilities[${index}] must define a name and a non-negative weight.`);
    }
  });
}

function validateMembers(members, errors) {
  if (!Array.isArray(members)) {
    errors.push('members must be an array.');
    return;
  }
  const ids = new Set();
  members.forEach((member, index) => {
    const validation = validateMember(member);
    validation.errors.forEach((error) => errors.push(`members[${index}]: ${error}`));
    if (member?.memberId && ids.has(member.memberId)) errors.push(`members contains duplicate memberId '${member.memberId}'.`);
    if (member?.memberId) ids.add(member.memberId);
  });
}

function validateRunState(run, errors) {
  if (!TEAM_RUN_STATUS.includes(run.status)) errors.push('status is invalid.');
  if (!TEAM_RUN_PHASE.includes(run.phase)) errors.push('phase is invalid.');
}

function validateRunDates(run, errors) {
  if (!isNonEmpty(run.createdAt) || Number.isNaN(Date.parse(run.createdAt))) errors.push('createdAt must be a valid date string.');
}

module.exports = { validateTeamRun };
