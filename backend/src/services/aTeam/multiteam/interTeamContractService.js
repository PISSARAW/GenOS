'use strict';

function validateInterTeamContracts(teams = [], contracts = []) {
  const ids = new Set((Array.isArray(teams) ? teams : []).map((team) => team.teamId));
  const errors = [];
  for (const contract of Array.isArray(contracts) ? contracts : []) {
    errors.push(...contractErrors(contract, ids));
  }
  return { valid: errors.length === 0, errors };
}

function contractErrors(contract, ids) {
  const errors = [];
  if (!ids.has(contract.fromTeamId) || !ids.has(contract.toTeamId)) errors.push(`Contract '${contract.contractId || 'unknown'}' references an unknown team.`);
  if (contract.fromTeamId === contract.toTeamId) errors.push('Inter-team contract endpoints must be different teams.');
  if (!Array.isArray(contract.provides) || !contract.provides.length) errors.push('Inter-team contract must declare provided artifacts.');
  if (!Array.isArray(contract.acceptanceCriteria) || !contract.acceptanceCriteria.length) errors.push('Inter-team contract must declare acceptance criteria.');
  return errors;
}

module.exports = { validateInterTeamContracts, contractErrors };
