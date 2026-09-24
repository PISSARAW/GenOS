'use strict';

const { validateInterTeamContracts } = require('./interTeamContractService');
const { compileProgramWorkGraph } = require('./programWorkGraph');
const { buildCoordinationCouncil } = require('./coordinationCouncilService');

const DEFAULT_LIMITS = Object.freeze({ maxTeams: 12, maxMembers: 120, maxDepth: 2 });

function composeMultiteam(input = {}) {
  const teams = Array.isArray(input.teams) ? input.teams : [];
  const limits = { ...DEFAULT_LIMITS, ...(input.limits || {}) };
  validateCaps(teams, limits, input.depth || 1);
  const contracts = Array.isArray(input.contracts) ? input.contracts : [];
  const validation = validateInterTeamContracts(teams, contracts);
  if (!validation.valid) throw Object.assign(new Error(validation.errors.join(' ')), { code: 'ATEAM_MTS_CONTRACT_INVALID', errors: validation.errors });
  return { teams, contracts, graph: compileProgramWorkGraph(teams, contracts), council: buildCoordinationCouncil(teams, input.council) };
}

function validateCaps(teams, limits, depth) {
  const members = teams.reduce((sum, team) => sum + (Array.isArray(team.members) ? team.members.length : 0), 0);
  const errors = [];
  if (!teams.length || teams.length > limits.maxTeams) errors.push('Team count is outside the configured limit.');
  if (members > limits.maxMembers) errors.push('Member count exceeds the configured limit.');
  if (depth > limits.maxDepth) errors.push('Nested team depth exceeds the configured limit.');
  if (teams.some((team) => !team.teamId)) errors.push('Every team requires a teamId.');
  if (new Set(teams.map((team) => team.teamId)).size !== teams.length) errors.push('Team identifiers must be unique.');
  if (errors.length) throw Object.assign(new Error(errors.join(' ')), { code: 'ATEAM_MTS_LIMIT', errors });
}

module.exports = { composeMultiteam, DEFAULT_LIMITS };
